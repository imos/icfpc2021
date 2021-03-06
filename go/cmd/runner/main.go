package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/golang/glog"
	"github.com/imos/icfpc2021/internal/api"
	"io/ioutil"
	"math/rand"
	"os"
	"os/exec"
	"path"
	"strings"
	"time"
)

func main() {
	flag.Parse()
	glog.Info("Started")
	for !Exists("/shutdown") {
		if err := Loop(); err != nil {
			glog.Errorf("ERROR: %+v", err)
		}
		time.Sleep(time.Second * 10)
	}
}

func Loop() error {
	ctx := context.Background()
	resp, err := api.RunAcquire(ctx)
	if err != nil {
		return err
	}
	if resp.RunID == 0 {
		glog.Info("No runs acquired")
		return nil
	}
	glog.Infof("Acquired a run: run_id=%d", resp.RunID)

	dir, err := os.MkdirTemp(os.TempDir(), "executor")
	name := fmt.Sprintf("c%06d", rand.Intn(1000000))
	glog.Infof("Running command: %s", resp.RunCommand)
	cmd := exec.CommandContext(ctx,
		"docker", "run", "--rm", "--name", name,
		"runner", "bash", "-c",
		strings.ReplaceAll(resp.RunCommand, "\r",""))
	cmd.Dir = dir
	stdout, err := os.Create(path.Join(dir, "stdout"))
	cmd.Stdout = stdout
	stderr, err := os.Create(path.Join(dir, "stderr"))
	cmd.Stderr = stderr
	cmd.Start()

	c := make(chan struct{})
	go func() {
		count := 0
		for {
			select {
			case _, ok := <-c:
				if !ok {
					return
				}
			case <-time.After(time.Second * 10):
				if err := api.RunExtend(ctx, resp.RunSignature); err == nil {
					count = 0
					exec.Command(
						"docker", "exec", name,
						"touch", "/watchdog").Run()
				} else {
					count += 1
					if count > 5 {
						return
					}
				}
			}
		}
	}()

	cmd.Wait()
	close(c)
	stdout.Close()
	stderr.Close()
	exitCode := cmd.ProcessState.ExitCode()
	result := api.RunFlushRequest{
		RunSignature: resp.RunSignature,
		RunCode: int64(exitCode),
		RunStdout: Summary(path.Join(dir, "stdout")),
		RunStderr: Summary(path.Join(dir, "stderr")),
	}
	return api.RunFlush(ctx, &result)
}

func Summary(file string) string {
	buf, _ := ioutil.ReadFile(file)
	if len(buf) <= 200000 {
		return string(buf)
	}
	b := []byte{}
	b = append(b, buf[:100000]...)
	b = append(b, []byte("...")...)
	b = append(b, buf[len(buf)-100000:]...)
	return string(b)
}

func Exists(name string) bool {
	_, err := os.Stat(name)
	return !os.IsNotExist(err)
}