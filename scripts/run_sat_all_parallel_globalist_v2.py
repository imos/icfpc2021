import glob
import os
import subprocess
import logging
import json
import multiprocessing
import multiprocessing.pool
import functools
import itertools
import urllib.parse
logger = logging.getLogger(__name__)





def problem_id_from_path(path):
    return int(os.path.basename(path).split('.')[0])


def evaluate(problem_id, solution_path):
    return json.loads(subprocess.run(
        f"cargo run --release --bin evaluate -- problems/{problem_id}.json {solution_path}",
        shell=True,
        check=True,
        capture_output=True,
    ).stdout)["dislikes"]


def doit(problem_and_obtained_bonuses, glucose_path):
    problem_id = problem_and_obtained_bonuses[0]
    obtained_bonuses = problem_and_obtained_bonuses[1]

    globalist_ids = ','.join([str(b["problem"]) for b in obtained_bonuses])
    # print(globalist_ids)

    work_dir = f"rsapg/{problem_id}_{globalist_ids}/"

    old_solution_path = f"best_solutions/{problem_id}_{globalist_ids}.json"

    # print(old_solution_path)

    # TODO: requiredで何も使ってないやつを落とさないと意味がないよ！
    if obtained_bonuses:
        obtained_bonuses = [
            {
                "bonus": b["bonus"],
                "position": b["position"],
                "problem": b["problem"]
            }
            for b in obtained_bonuses
        ]
        obtained_bonuses_str = json.dumps(obtained_bonuses, separators=(',', ':'))
        print(obtained_bonuses_str)
        obtained_bonuses_str = urllib.parse.quote(obtained_bonuses_str)
        url = f"https://icfpc.sx9.jp/best_solution?problem_id={problem_id}&obtained_bonus={obtained_bonuses_str}"
    else:
        url = f"https://icfpc.sx9.jp/best_solution?problem_id={problem_id}"

    subprocess.run(
        f'curl "{url}" '
        f'> "{old_solution_path}"',
        shell=True,
        check=True,
    )

    if len(open(old_solution_path).read().strip()) == 0:
        return f"{problem_id}\t{globalist_ids}\tNO INPUT"

    old_score = evaluate(problem_id, old_solution_path)

    result = subprocess.run(
        f'cargo run --release --bin sat_hillclimber -- '
        f'--glucose-path {glucose_path} '
        f'--input-path "problems/{problem_id}.json" '
        f'--output-path "{old_solution_path}" '
        f'--work-dir {work_dir} '
        f'--max-neighbor 15 '
        f'--globalist {globalist_ids}',
        shell=True,
    )

    if result.returncode != 0:
        return f"{problem_id}\t{globalist_ids}\t{old_score}\tFAIL"
    else:
        solution_path = f"{work_dir}/sol999999.json"
        new_score = evaluate(problem_id, solution_path)

        subprocess.run(
            ["curl", "-X", "POST", "-d", f"@{solution_path}",
             f"https://icfpc.sx9.jp/api/submit?problem_id={problem_id}"],
            check=True)

        return f"{problem_id}\t{globalist_ids}\t{old_score}\t{new_score}"


def generate_problems_bonuses_sets(problem_id):
    from itertools import chain, combinations

    def powerset(iterable):
        "powerset([1,2,3]) --> () (1,) (2,) (3,) (1,2) (1,3) (2,3) (1,2,3)"
        s = list(iterable)
        return chain.from_iterable(combinations(s, r) for r in range(len(s) + 1))

    j = json.load(open(f"./problems/{problem_id}.json"))
    gs = [b for b in j["bonuses"] if b["bonus"] == "GLOBALIST"]

    return [(problem_id, g) for g in powerset(gs)]  #if len(g) > 0]


def main(
        problem=None,
        glucose_path="/home/takiba/Desktop/glucose-syrup-4.1/simp/glucose",
        n_threads=8,
        dryrun=False,
):
    logging.basicConfig(filename='run_sat_all_globalist.log', level=logging.DEBUG)
    logger.info(f"\n{'=' * 80}\nSTART!\n{'=' * 80}")

    if problem:
        problem_ids = [problem]
    else:
        paths = list(glob.glob("./problems/*.json"))
        problem_ids = list(map(problem_id_from_path, paths))
        problem_ids.sort()

    problems_bonuses = list(itertools.chain.from_iterable(
        generate_problems_bonuses_sets(problem_id)
        for problem_id in problem_ids
    ))

    if dryrun:
        n_threads = 1
        problems_bonuses = problems_bonuses[:10]

    # problems_globalists = problems_globalists[:10]
    # problem_ids = [p for p in problem_ids if p >= 100]

    tpool = multiprocessing.pool.ThreadPool(n_threads)
    results = tpool.imap(
        functools.partial(doit, glucose_path=glucose_path),
        problems_bonuses,
        chunksize=1
    )
    for result in results:
        logger.info("\t" + result)


if __name__ == '__main__':
    import fire
    fire.Fire(main)
