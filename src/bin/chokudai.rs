use chrono::format::format;
use icfpc2021::*;
use image::imageops::horizontal_gradient;
use rand::prelude::*;
use icfpc2021::{mat, util::SetMinMax as _};
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

	let input_path = format!("{}{}{}", "./problems/", args[1], ".json");
	let output_path= format!("{}{}{}", "../../Users/choku/Dropbox/ICFPC2021/best/", args[1], ".json");

	//eprintln!("{}", input_path);
	//eprintln!("{}", output_path);

	let input = read_input_from_file(&input_path.into());
	let output = read_output_from_file(&output_path.into());
	dbg!(&input);

	let n = output.vertices.len();
	let v = input.hole.len();
	
	let mut first_now = output.vertices.clone();
	
	let mut maxnum = 0;
	for p in &input.hole{
		if maxnum < p.0{
			maxnum = p.0;
		}	
		
		if maxnum < p.1{
			maxnum = p.1;
		}	
	}

	for p in &input.figure.vertices{
		if maxnum < p.0{
			maxnum = p.0;
		}	
		
		if maxnum < p.1{
			maxnum = p.1;
		}	
	}
	/*
	let mut dist = mat![1e20; n; n];
	for &(i, j) in &input.figure.edges {
		g[i].push(j);
		g[j].push(i);
		dist[i][j] = ((input.figure.vertices[i] - input.figure.vertices[j]).abs2() as f64).sqrt();
		dist[j][i] = dist[i][j];
	}
	for k in 0..n {
		for i in 0..n {
			for j in 0..n {
				let tmp = dist[i][k] + dist[k][j];
				dist[i][j].setmin(tmp);
			}
		}
	}
 	*/
	
	let maxnum = (maxnum + 1) as usize;
	
	for i in 0..n {
		//first_now[i] = P(maxnum as i64 / 2, maxnum as i64 / 2);
		first_now[i] = output.vertices[i].clone();
		//first_now[i] = P(thread_rng().gen_range(0..maxnum) as i64, thread_rng().gen_range(0..maxnum) as i64);
	}

	let eps = input.epsilon;



	let vp: [P<i64>; 8] = [P(1, 0), P(0, 1), P(-1, 0), P(0, -1), P(1, 1), P(1, -1), P(-1, -1), P(-1, 1)];

	let mut point_board = vec![vec![0.0; maxnum]; maxnum];

	
	for y in 0..maxnum {
		for x in 0..maxnum {
			for k in 0.. v {
				if P::contains_p(&input.hole, P(y as i64, x as i64)) == -1 {
					point_board[y as usize][x as usize] = 99999.0;
				}
			}
		}
	}

	for i in 0..300 {
		let mut flag = true;
		for y in 0..maxnum {
			for x in 0..maxnum {
				if point_board[y as usize][x as usize] > 100.0 {
					for k in 0..4 {
						let ny = (y as i64 + vp[k].0);
						let nx = (x as i64 + vp[k].1);
						if ny >= 0 && ny < maxnum as i64 && nx >= 0 && nx < maxnum as i64 && point_board[ny as usize][nx as usize] == i as f64{
							point_board[y as usize][x as usize] = (i + 1) as f64;
							flag = false;
						}
					}
				}
			}
		}
		if flag { break; }
	}

	let mut allbest =  -9999999999999999.0;
	let mut allbest2 =  -9999999999999999.0;
	let mut best_ans = first_now.clone();

	let mut best_part = vec![0; v];
	for i in 0..v {
		best_part[i] = thread_rng().gen_range(0..n);
	}

	loop{
		
		/* 
		let mut now_temp =first_now.clone();
		let movenum = thread_rng().gen_range(0..n);
		now_temp[movenum].0 = thread_rng().gen_range(0..maxnum) as i64;
		now_temp[movenum].1 = thread_rng().gen_range(0..maxnum) as i64;
		
		for i in 0..n {
			//now_temp[i] = P(thread_rng().gen_range(0..maxnum) as i64, thread_rng().gen_range(0..maxnum) as i64);
		}
		*/

		let mut now = first_now.clone();
		
		/* 
		for i in 0..n {
			now[i] = P(thread_rng().gen_range(0..maxnum) as i64, thread_rng().gen_range(0..maxnum) as i64);
		}

		let mut nowpart = best_part.clone();
		let movenum = thread_rng().gen_range(0..v);
		nowpart[movenum] = thread_rng().gen_range(0..n);
		
		for i in 0..v {
			now[nowpart[i]] = input.hole[i].clone();
		}
		*/


		let ret = get_all_score(&input, &now, eps, &point_board);
		let mut bestscore  = ret.0;
		let mut bestscore2  =  -9999999999999999.0;
		let mut update = 30000;

		//eprintln!(" first_score : {}", bestscore);

		let loopend = 3000000;

		for cnt in 0..loopend{
			if update < 0 { break; }
			update -= 1;
			let target =  thread_rng().gen_range(0..n);
			let now_score = get_all_score(&input, &now, eps, &point_board);
			let move_type = thread_rng().gen_range(0..8);
			now[target] = now[target] + vp[move_type];

			if now[target].0 < 0 || now[target].1 < 0 || now[target].0 >= maxnum as i64 || now[target].1 >= maxnum as i64 {
				now[target] = now[target] - vp[move_type];
				continue;
			}

			let temp =  cnt as f64 / loopend as f64;

			let next_score = get_all_score(&input, &now, eps, &point_board);

			
			if now_score.0 - next_score.0 > thread_rng().gen_range(0..1000) as f64 * (1.0 - temp) * (1.0 - temp) / 100.0 {
				now[target] = now[target] - vp[move_type];
			}
			else if next_score.0 > bestscore{
				//println!(" temp : {} {} {}", cnt, next_score.0, next_score.1);
				bestscore = next_score.0;
				if allbest2 < bestscore{
					allbest2 = bestscore;
				}

				update = 30000;
			}
			if allbest < next_score.0 && next_score.1 == 0.0 {
				eprintln!(" OK! : {} {}", cnt, next_score.0);
				allbest = next_score.0;
				bestscore2 = next_score.0;
				best_ans = now.clone();
				write_output(&Output { vertices: best_ans.clone() })
			}
		}

		//if allbest2 == bestscore {
		//	best_part = nowpart.clone();
		//}

		eprintln!("{}", bestscore);

		if allbest >= 0.0 { break; }
	}
	
	eprintln!("ans : {}", 100000.0 - allbest);

	write_output(&Output { vertices: best_ans.clone() })
}



// 暫定的な評価を計算する
// 実装予定
// 加点：　dislikeの距離そのまま
// 減点（外に点がはみ出る）：　(はみ出た距離 + 1) * outside_value
// 減点（外に線がはみ出る）：　outside_value2
// 減点（距離）： (多角形内部までのマンハッタン距離) * distance_value
fn get_all_score(inp: &Input, now: &Vec<P<i64>>, eps: i64, point_board: &Vec<Vec<f64>>) -> (f64, f64) {

	let outside_value = 10.0;
	let outside_value2 = 1000000.0;
	let distance_value = 50.0;

	let mut score = 0.0;
	let mut score2 = 0.0;
	let vs = inp.figure.vertices.clone();
	let es = inp.figure.edges.clone();
	let n = vs.len();
	//let Hole = inp.hole;

	for v in 0..n{
		score -= pow3(point_board[now[v].0 as usize][now[v].1 as usize]) * outside_value;
	}

	for e in es {
		let d1 = hyp(vs[e.0].0 - vs[e.1].0, vs[e.0].1 - vs[e.1].1); 
		let d2 = hyp(now[e.0].0 - now[e.1].0, now[e.0].1 - now[e.1].1);
		let epsd = (d1 * eps) as f64 / 1000000.0;
		let mut dd = (d2 - d1) as f64;
		let mut inner_flag = false;

		if dd < 0.0 {dd = -dd;}
		if dd <= epsd {
			dd = 0.0;
			//dd /= 5.0;
			//inner_flag = true;
		}
		else {dd = dd - epsd; }
		
		if dd <= 1.0{
			dd /= 2.0;
		}
		else if dd <= 2.0{
			//dd /= 100.0;
		}
		else if dd <= 3.0{
			//dd /= 10.0;
		}
		
		score -= dd * distance_value;
		if inner_flag {
			//score2 -= dd * distance_value;
		}

		if !P::contains_s(&inp.hole, (now[e.0], now[e.1])) {
			score -= outside_value2;
		}
	}

	let okflag = score - score2;

	if true {
		score += 100000.0;
		for i in &inp.hole{
			let mut min_dist = 99999999999;
			for j in 0..n {
				let dist = hyp(now[j].0 - i.0, now[j].1 - i.1);
				if dist < min_dist {
					min_dist = dist;
				}
			}
			score -= min_dist as f64;
		}
	}

	/*
	score += 100000.0;
	for i in 0..inp.hole.len() {
		score -= hyp(now[part[i]].0 -  inp.hole[i].0, now[part[i]].1 -  inp.hole[i].1) as f64;
	}
	*/
	return (score, okflag);
}

fn hyp(a: i64, b: i64) -> i64{
	return a * a + b * b;
}

fn pow3(a: f64) -> f64{
	return a * a * a;
}