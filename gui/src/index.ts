import * as PIXI from "pixi.js";
import { Container, DisplayObject, Graphics } from "pixi.js";
import { DragHandler } from "./dragdrop";

// lazy import
import wasm_, { AllPairDist } from "icfpc2021";
let wasm: undefined | typeof wasm_;

const urlParams = new URL(document.location.href).searchParams;

const WHITE: number = 0xffffff;

type XY = [number, number];

function abs2([x0, y0]: XY, [x1, y1]: XY): number {
  const x = x0 - x1;
  const y = y0 - y1;
  return x * x + y * y;
}

function xyFromPoint({ x, y }: { x: number; y: number }): XY {
  return [x, y];
}

PIXI.settings.RESOLUTION = window.devicePixelRatio || 1;
const app = new PIXI.Application({
  width: parseInt(urlParams.get("w") ?? "800"),
  height: parseInt(urlParams.get("h") ?? "600"),
  backgroundColor: 0x999999,
  autoDensity: true,
});
document.body.appendChild(app.view);

const mainContainer = new Container();
let guiScale = 4;
mainContainer.scale.set(guiScale); // wip
app.stage.addChild(mainContainer);

type Problem = {
  hole: XY[];
  epsilon: number;
  figure: {
    vertices: XY[];
    edges: [number, number][];
  };
  internal?: {
    reversed_hole: boolean;
  };
};

type Solution = {
  vertices: XY[];
};

// 1.json
// prettier-ignore
const sampleInput: string = '{"hole":[[45,80],[35,95],[5,95],[35,50],[5,5],[35,5],[95,95],[65,95],[55,80]],"epsilon":150000,"figure":{"edges":[[2,5],[5,4],[4,1],[1,0],[0,8],[8,3],[3,7],[7,11],[11,13],[13,12],[12,18],[18,19],[19,14],[14,15],[15,17],[17,16],[16,10],[10,6],[6,2],[8,12],[7,9],[9,3],[8,9],[9,12],[13,9],[9,11],[4,8],[12,14],[5,10],[10,15]],"vertices":[[20,30],[20,40],[30,95],[40,15],[40,35],[40,65],[40,95],[45,5],[45,25],[50,15],[50,70],[55,5],[55,25],[60,15],[60,35],[60,65],[60,95],[70,95],[80,30],[80,40]]}}';
// sampleInput.hole.reverse();

// prettier-ignore
const sampleOutput: string = '{"vertices":[[35,51],[40,60],[83,93],[34,25],[48,40],[59,70],[73,92],[29,15],[44,29],[40,18],[49,76],[36,7],[34,27],[30,17],[32,38],[40,69],[27,94],[17,93],[11,13],[18,21]]}';
// const sampleOutput: Solution = {"vertices": [[21, 28], [31, 28], [31, 87], [29, 41], [44, 43], [58, 70],[38, 79], [32, 31], [36, 50], [39, 40], [66, 77], [42, 29],[46, 49], [49, 38], [39, 57], [69, 66], [41, 70], [39, 60],[42, 25], [40, 35]]};

class VertexObject {
  g: Graphics;
  edges: EdgeObject[];

  constructor([x, y]: XY, public hole: XY[]) {
    const g = new Graphics().beginFill(WHITE).drawCircle(0, 0, 6);
    g.position.set(x, y);
    g.scale.set(1 / guiScale);
    this.g = g;
    this.edges = [];
    this.update();
  }

  get pos(): XY {
    return xyFromPoint(this.g.position);
  }

  set pos([x, y]: XY) {
    this.g.position.set(x, y);
  }

  update(updateEdges: boolean = true): void {
    const g = this.g;
    let [x, y] = this.pos;
    x = Math.round(x);
    y = Math.round(y);
    g.position.set(x, y);
    const atCorner = this.hole.some(([hx, hy]) => hx === x && hy === y);
    g.tint = atCorner ? 0x00ff00 : 0x008000;
    if (updateEdges) {
      for (const edge of this.edges) {
        edge.update();
      }
    }
  }
}

class EdgeObject {
  g: Graphics;
  d2Orig: number;

  constructor(
    public vertex0: VertexObject,
    public vertex1: VertexObject,
    public epsilon: number
  ) {
    vertex0.edges.push(this);
    vertex1.edges.push(this);
    const p0 = this.vertex0.pos;
    const p1 = this.vertex1.pos;
    this.g = new Graphics();
    this.d2Orig = abs2(p0, p1);
    this.update();
  }

  update(): void {
    const d2Orig = this.d2Orig;
    const p0 = this.vertex0.pos;
    const p1 = this.vertex1.pos;
    const d2Now = abs2(p0, p1);
    const atol = d2Orig * this.epsilon;
    const target = 1_000_000 * d2Orig;
    const ok = Math.abs(1_000_000 * d2Now - target) <= atol;
    const color = ok ? 0x0000ff : d2Now < d2Orig ? 0xcccc00 : 0xff0000;
    const g = this.g;
    g.zIndex = ok ? 0 : 1;
    g.tint = color;
    g.clear()
      .lineStyle({
        color: WHITE,
        width: 1,
        cap: "round" as any,
      })
      .moveTo(...p0)
      .lineTo(...p1);
  }

  hintFor(vertex: VertexObject): Graphics {
    const rInner = Math.sqrt(this.d2Orig * (1 - this.epsilon / 1_000_000));
    const rOuter = Math.sqrt(this.d2Orig * (1 + this.epsilon / 1_000_000));
    const [x, y] = [this.vertex0, this.vertex1].find((v) => v !== vertex)!.pos;
    console.log(x, y, rInner, rOuter);
    return new Graphics()
      .beginFill(0x0000ff, 0.2)
      .drawCircle(x, y, rOuter)
      .beginHole()
      .drawCircle(x, y, rInner);
  }
}

class ProblemRenderer {
  inputJson: Problem;
  hole: Graphics;
  holeCorners: DisplayObject[];
  vertices: VertexObject[];
  edges: EdgeObject[];
  epsilon: number;
  lastDrag?: VertexObject;
  hintContainer?: Container;
  allPairDist?: AllPairDist;

  constructor(problem: string) {
    console.log(problem);
    const inputJson: Problem = (wasm?.read_problem ?? JSON.parse)(problem);
    console.log(inputJson);
    this.inputJson = inputJson;
    if (wasm != null) {
      this.allPairDist = wasm.AllPairDist.from_problem(inputJson);
    }
    const dropArea = new Container(); // unused...
    const dragHandler = new DragHandler(
      app.renderer.plugins.interaction,
      dropArea
    );

    const hole = new Graphics()
      .beginFill(0xffffff)
      .moveTo(...inputJson.hole[0]);
    for (const [x, y] of inputJson.hole.slice(1)) {
      hole.lineTo(x, y);
    }
    hole.closePath();

    const holeCorners = [];
    let origHole = inputJson.hole.slice();
    if (inputJson.internal?.reversed_hole) {
      origHole.reverse();
    }
    for (const [i, [x, y]] of origHole.entries()) {
      // TODO: maybe reversed
      const text = new PIXI.Text(`${i}`, {
        fontSize: 12,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 2,
        // align: "center",
      });
      text.anchor.set(0.5);
      text.position.set(x, y);
      text.scale.set(1 / guiScale);
      holeCorners.push(text);
    }
    this.holeCorners = holeCorners;

    const fig = inputJson.figure;

    const vertices: VertexObject[] = fig.vertices.map(
      (xy) => new VertexObject(xy, origHole)
    );

    // for (const [i, v] of vertices.entries()) {
    //   const text = new PIXI.Text(`${i}`, {
    //     fontSize: 12,
    //     fill: 0xffffff,
    //     stroke: 0x000000,
    //     strokeThickness: 2,
    //     // align: "center",
    //   });
    //   text.anchor.set(0.5);
    //   v.addChild(text);
    // }

    this.epsilon = inputJson.epsilon;
    const edges: EdgeObject[] = [];
    for (const [i, j] of fig.edges) {
      const edge = new EdgeObject(vertices[i], vertices[j], this.epsilon);
      edges.push(edge);
    }

    this.hole = hole;
    this.edges = edges;
    this.vertices = vertices;
    for (const [k, v] of vertices.entries()) {
      dragHandler.register(v.g);
      v.g
        .on("dragstart", () => {
          let c = this.hintContainer;
          if (c == null) {
            c = new Container();
            mainContainer.addChild(c);
            this.hintContainer = c;
          }
          c.addChild(...v.edges.map((e) => e.hintFor(v)));
        })
        .on("drag", () => {
          v.update();
        })
        .on("dragend", () => {
          let c = this.hintContainer;
          if (c != null) {
            mainContainer.removeChild(c);
            delete this.hintContainer;
          }
          this.update();
          this.lastDrag = v;
        });
    }

    this.update();
  }

  moveLastVertex([dx, dy]: XY): void {
    const v = this.lastDrag;
    if (v == null) return;
    let [x, y] = v.pos;
    x = Math.round(x + dx);
    y = Math.round(y + dy);
    v.pos = [x, y];
    v.update();
    this.update();
  }

  update(): void {
    const solutionJson = this.pose;
    this.runCheckSolution1(this.inputJson, solutionJson);
    console.log(this.allPairDist?.test_pose(solutionJson));
    (document.getElementById("output-json") as any).value = (
      wasm?.write_pose ?? JSON.stringify
    )(solutionJson);
  }

  runCheckSolution1(input: Problem, output: Solution): void {
    if (wasm == null) return;
    const [ok_v, ok_e] = wasm.check_solution1(input, output);
    for (const [i, ok] of ok_v.entries()) {
      if (!ok) {
        this.vertices[i].g.tint = 0x800080;
      }
    }
    for (const [i, ok] of ok_e.entries()) {
      if (!ok) {
        const g = this.edges[i].g;
        g.zIndex = 2;
        g.tint = 0x800080;
      }
    }
  }

  loadSolution(pose: string): void {
    const solutionJson = (wasm?.read_pose ?? JSON.parse)(pose);
    if (this.vertices.length != solutionJson.vertices.length) {
      alert("vertices.length differs");
      return;
    }
    for (const [i, v] of solutionJson.vertices.entries()) {
      this.vertices[i].pos = v;
      this.vertices[i].update(false);
    }
    for (const edge of this.edges) {
      edge.update();
    }

    this.update();
  }

  get pose(): Solution {
    return { vertices: this.vertices.map((v) => v.pos) };
  }

  render(c: Container): void {
    c.removeChildren();
    let edgesContainer = new Container();
    edgesContainer.sortableChildren = true;
    edgesContainer.addChild(...this.edges.map(({ g }) => g));
    c.addChild(
      this.hole,
      edgesContainer,
      ...this.holeCorners,
      ...this.vertices.map(({ g }) => g)
    );
  }

  updateGuiScale(): void {
    for (const v of [...this.vertices.map(({ g }) => g), ...this.holeCorners]) {
      v.scale.set(1 / guiScale);
    }
  }
}

mainContainer.addChild(new PIXI.Text("loading wasm", { fill: "red" }));
// console.log(wasm);
// console.log(wasm.check_solution1);
// console.log(wasm.check_solution1(sampleInput, sampleOutput));

(wasm_ as any)
  .then((wasm__: any) => {
    wasm = wasm__;
  })
  .catch((e: any) => {
    console.log("failed to load wasm:", e);
  })
  .then(() => {
    let r = new ProblemRenderer(sampleInput);
    r.render(mainContainer);
    r.loadSolution(sampleOutput);

    document.addEventListener("keydown", (e) => {
      const vec = {
        ArrowLeft: [-1, 0],
        ArrowUp: [0, -1],
        ArrowRight: [1, 0],
        ArrowDown: [0, 1],
      }[e.key];
      if (vec == null) return;
      r.moveLastVertex(vec as any);
    });

    document.addEventListener("keydown", (e) => {
      const vec = {
        a: [-1, 0],
        w: [0, -1],
        d: [1, 0],
        s: [0, 1],
      }[e.key.toLowerCase()];
      if (vec == null) return;
      const flip = (document.getElementById("flip-wasd") as any).checked;
      const scale = flip ? -100 : 100;
      const [x, y] = vec as any;
      mainContainer.x += scale * x;
      mainContainer.y += scale * y;
    });

    // load problem
    {
      const fileElem: any = document.getElementById("input-json")!;
      fileElem.addEventListener("change", () => {
        const file = fileElem.files[0];
        if (file == null) return;
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = (e) => {
          const problem = e.target!.result as string;
          r = new ProblemRenderer(problem);
          r.render(mainContainer);
        };
      });
    }

    // load solution
    {
      const fileElem: any = document.getElementById("input-solution-json")!;
      fileElem.addEventListener("change", () => {
        const file = fileElem.files[0];
        if (file == null) return;
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = (e) => {
          const pose = e.target!.result as string;
          r.loadSolution(pose);
        };
      });
    }

    // gui scale
    {
      const elem: any = document.getElementById("gui-scale")!;
      elem.addEventListener("change", () => {
        guiScale = parseInt(elem.value);
        mainContainer.scale.set(guiScale);
        r.updateGuiScale();
      });
    }
  });
