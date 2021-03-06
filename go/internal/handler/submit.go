package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"

	"github.com/golang/glog"
	"github.com/imos/icfpc2021/pkg/db"
	"github.com/pkg/errors"
)

func init() {
	http.HandleFunc("/api/submit", handleAPISubmit)
	http.HandleFunc("/api/final_submit", handleAPIFinalSubmit)
	http.HandleFunc("/submit", handleSubmit)
}

func handleSubmit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if r.Method == "GET" {
		// 		fmt.Fprintln(w, `
		// <body><form action="/submit" method="POST">
		// Problem ID: <input type="text" name="problem_id"><br><br>
		// JSON:
		// <textarea name="data"></textarea><br><br>
		// 強制アップデート（スコアを確認しない）:
		// <input type="checkbox" name="force" value="1"><br><br>
		// <input type="submit" value="Submit">
		// </form></body>
		// `)
		http.Redirect(w, r, "/static/show/", http.StatusMovedPermanently)
		return
	}
	r.ParseForm()
	problemID, err := strconv.ParseInt(r.Form.Get("problem_id"), 10, 64)
	if err != nil {
		fmt.Fprintf(w, "Failed to parse problem_id: %+v", err)
	}
	submissionID, err := Submit(ctx, problemID, r.Form.Get("data"), r.Form.Get("force") == "1")
	if err != nil {
		fmt.Fprintf(w, "Failed to submit: %+v", err)
	}
	fmt.Fprintf(w, "Submission ID: %d", submissionID)
}

func handleAPISubmit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if r.Body == nil {
		glog.Errorf("body is empty")
		w.WriteHeader(400)
		return
	}
	defer r.Body.Close()
	buf, err := ioutil.ReadAll(r.Body)
	if err != nil {
		glog.Errorf("body is broken: %#v", err)
		w.WriteHeader(400)
		return
	}

	problemID, err := strconv.ParseInt(
		r.URL.Query().Get("problem_id"), 10, 64)
	if err != nil {
		glog.Errorf("Failed to parse problem ID: %+v", err)
		w.WriteHeader(400)
		return
	}

	poseID, err := Submit(ctx, problemID, string(buf), false)
	if err != nil {
		glog.Errorf("Failed to submit: %+v", err)
		w.WriteHeader(400)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "%d", poseID)
}

func handleAPIFinalSubmit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if r.Body == nil {
		glog.Errorf("body is empty")
		w.WriteHeader(400)
		return
	}
	defer r.Body.Close()
	buf, err := ioutil.ReadAll(r.Body)
	if err != nil {
		glog.Errorf("body is broken: %#v", err)
		w.WriteHeader(400)
		return
	}

	problemID, err := strconv.ParseInt(
		r.URL.Query().Get("problem_id"), 10, 64)
	if err != nil {
		glog.Errorf("Failed to parse problem ID: %+v", err)
		w.WriteHeader(400)
		return
	}

	poseID, submissionID, err := FinalSubmit(ctx, problemID, string(buf))
	if err != nil {
		glog.Errorf("Failed to submit: %+v", err)
		w.WriteHeader(400)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "pose_id=%s submission_id=%d", poseID, submissionID)
}

func FinalSubmit(ctx context.Context, problemID int64, solution string) (string, int64, error) {
	evaluation, err := EstimateScore(ctx, problemID, solution)
	if err != nil {
		return "", 0, err
	}
	if evaluation.Dislikes < 0 {
		return "", 0, errors.New("solution is invalid")
	}


	poseID, err := submitToOfficial(problemID, solution)
	if err != nil {
		return poseID, 0, err
	}

	result, err := db.Execute(ctx, `
INSERT INTO submissions
SET
	problem_id = ?,
	submission_data = ?,
	submission_bonuses = ?,
	submission_obtained_bonuses = ?,
	submission_estimated_score = ?,
	submission_uuid = ?,
	submission_submitted = CURRENT_TIMESTAMP()
`,
		problemID, solution,
		evaluation.BonusesStr,
		evaluation.ObtainedBonusesStr,
		evaluation.Dislikes,
		poseID)
	if err != nil {
		return poseID, 0, errors.Wrapf(err, "failed to insert a submission")
	}

	id, err := result.LastInsertId()
	if err != nil {
		return poseID, 0, errors.Wrapf(err, "failed to get an insert ID")
	}
	return poseID, id, nil
}

func Submit(ctx context.Context, problemID int64, solution string, force bool) (int64, error) {
	evaluation, err := EstimateScore(ctx, problemID, solution)
	if err != nil {
		return 0, err
	}
	if evaluation.Dislikes < 0 {
		return 0, errors.New("solution is invalid")
	}

	var officialBestScore int64
	err = db.Cell(ctx, &officialBestScore, `
SELECT COALESCE(MIN(submission_score), -1)
FROM submissions
WHERE problem_id = ? AND submission_bonuses_hash = ? AND submission_score >= 0
`, problemID, evaluation.BonusesHash)
	if err != nil {
		return 0, errors.Wrapf(err, "failed to get the best score")
	}

	if !force {
		if officialBestScore != -1 && officialBestScore <= evaluation.Dislikes {
			glog.Infof("Official best score is better: %d vs %d", evaluation.Dislikes, officialBestScore)
			return 0, nil
		}
	}

	var bestScore int64
	err = db.Cell(ctx, &bestScore, `
SELECT COALESCE(MIN(submission_estimated_score), -1)
FROM submissions
WHERE problem_id = ? AND submission_bonuses_hash = ? AND submission_estimated_score >= 0
`, problemID, evaluation.BonusesHash)
	if err != nil {
		return 0, errors.Wrapf(err, "failed to get the best score")
	}

	var allBestScore int64
	err = db.Cell(ctx, &allBestScore, `
SELECT COALESCE(MIN(submission_estimated_score), -1)
FROM submissions
WHERE problem_id = ? AND submission_estimated_score >= 0
`, problemID)
	if err != nil {
		return 0, errors.Wrapf(err, "failed to get the all best score")
	}

	poseID := ""
	// var poseID string
	// if allBestScore == -1 || evaluation.Dislikes < allBestScore || force {
	// 	poseID, err = submitToOfficial(problemID, solution)
	// 	if err != nil {
	// 		return 0, err
	// 	}
	// } else {
	// 	glog.Infof("Skipping submission: %d vs %d", evaluation.Dislikes, bestScore)
	// }

	result, err := db.Execute(ctx, `
INSERT INTO submissions
SET
	problem_id = ?,
	submission_data = ?,
	submission_bonuses = ?,
	submission_obtained_bonuses = ?,
	submission_estimated_score = ?,
	submission_uuid = ?,
	submission_submitted = CURRENT_TIMESTAMP()
`,
		problemID, solution,
		evaluation.BonusesStr,
		evaluation.ObtainedBonusesStr,
		evaluation.Dislikes,
		poseID)
	if err != nil {
		return 0, errors.Wrapf(err, "failed to insert a submission")
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, errors.Wrapf(err, "failed to get an insert ID")
	}
	return id, nil
}

func submitToOfficial(problemID int64, solution string) (string, error) {
	glog.Infof("Problem ID: %d, solution: %s", problemID, solution)
	var vertices struct {
		Vertices [][]int64 `json:"vertices"`
	}
	if err := json.Unmarshal([]byte(solution), &vertices); err != nil {
		return "", errors.Wrapf(err, "failed to parse the solution: %+v", err)
	}
	if len(vertices.Vertices) == 0 {
		return "", errors.Errorf("No verticies are provided")
	}

	req, err := http.NewRequest(
		"POST",
		fmt.Sprintf("https://poses.live/api/problems/%d/solutions", problemID),
		bytes.NewBuffer([]byte(solution)))
	if err != nil {
		return "", errors.Wrapf(err, "failed to create a submission request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("UNAGI_API_KEY"))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", errors.Wrapf(err, "failed to submit a solution")
	}
	defer resp.Body.Close()

	buf, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", errors.Wrapf(err, "failed to read the submission response")
	}

	glog.Infof("Response: %s", string(buf))
	var response struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(buf, &response); err != nil {
		return "", errors.Wrapf(err, "failed to parse a response: %+v", err)
	}
	return response.ID, nil
}
