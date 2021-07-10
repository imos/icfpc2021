use icfpc2021::paths::*;
use icfpc2021::*;
use std::fs::File;

// Usage: show_problem [problem.json]
fn main() -> std::io::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    let prob = if args.len() < 2 {
        read_input()
    } else {
        serde_json::from_reader(File::open(&args[1])?)?
    };

    render_problem_svg(&prob, std::io::stdout())
}
