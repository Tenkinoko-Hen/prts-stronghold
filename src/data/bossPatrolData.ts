// 客户端 6f63c14e · act3autochess。提取双人战斗区 x=2–18、y=16–20，行从上向下。
export interface PatrolBoard {
  id: string;
  tiles: readonly string[];
  objects: readonly (readonly [x: number, y: number, kind: '箱' | '台' | '箱台'])[];
}

export const PATROL_BOARDS: readonly PatrolBoard[] = [
  { id: '01', tiles: ["##.....^T^.....##", "##.###.^^^.###.##", "##.###.^^^.###.##", "B..###..T..###..B", "#TSSSSS###SSSSST#"], objects: [[3, 1, "箱"], [3, 2, "箱"], [4, 2, "箱"], [13, 1, "箱"], [13, 2, "箱"], [12, 2, "箱"]] },
  { id: '02', tiles: ["#......^T^......#", "#.##...^^^...##.#", "#.##.##^^^##.##.#", "B....##.T.##....B", "#TSSSSS###SSSSST#"], objects: [[2, 0, "箱台"], [3, 0, "箱台"], [5, 1, "箱台"], [6, 1, "箱台"], [14, 0, "箱台"], [13, 0, "箱台"], [11, 1, "箱台"], [10, 1, "箱台"]] },
  { id: '03', tiles: ["####...^T^...####", "####.##^^^##.####", "#^^..##^^^##..^^#", "B.......T.......B", "#TSSSSS###SSSSST#"], objects: [[14, 2, "台"], [1, 2, "台"], [2, 2, "台"], [15, 2, "台"], [13, 1, "箱"], [3, 1, "箱"], [5, 1, "台"], [10, 1, "台"], [11, 1, "台"], [6, 1, "台"]] },
  { id: '04', tiles: ["##.###.^T^.###.##", "##..I..^^^..I..##", "##..I..^^^..I..##", "B..###..T..###..B", "#TSSSSS###SSSSST#"], objects: [[1, 0, "箱"], [2, 0, "箱"], [6, 0, "箱"], [15, 0, "箱"], [14, 0, "箱"], [10, 0, "箱"]] },
  { id: '05', tiles: ["##W...#^T^#...W##", "##W.#.#^^^#.#.W##", "##W.#.#^^^#.#.W##", "B...#...T...#...B", "#TSSSSS###SSSSST#"], objects: [] },
  { id: '06', tiles: ["####WM.^T^.MW####", "###W#M#^^^#M#W###", "##W##M#^^^#M##W##", "B.......T.......B", "#TSSSSS###SSSSST#"], objects: [] },
  { id: '09', tiles: ["#......^T^......#", "#.#.GG#^^^#GG.#.#", "#.#.WG#^^^#GW.#.#", "B...#G..T..G#...B", "#TSSSSS###SSSSST#"], objects: [] },
  { id: '10', tiles: ["#W.....^T^.....W#", "#W.#...^^^...#.W#", "#W.#.#.^^^.#.#.W#", "B....##.T.##....B", "#TSSSSS###SSSSST#"], objects: [] },
  { id: '11', tiles: ["####...^T^...####", "#....##^^^##....#", "#.W#...^^^...#W.#", "B....##^T^##....B", "#TSSSSS###SSSSST#"], objects: [] },
  { id: '12', tiles: ["###..A#^T^#A..###", "#...#A.^^^.A#...#", "#...###^^^###...#", "B.#..A..T..A..#.B", "#TSSSSS###SSSSST#"], objects: [] },
];

// R14 路标来自 h07_02、h07_10、h07_11；投影到上方 5×17 战斗区。
type PatrolPoint = readonly [x: number, y: number];
export const PATROL_SPAWN: PatrolPoint = [8, 1];
export const PATROL_WAYPOINTS = {
  left: [[7, 0], [1, 3], [7, 2]],
  right: [[9, 2], [15, 3], [9, 0]],
  rightBeast: [[9, 0], [15, 3], [9, 2]],
} as const satisfies Record<string, readonly PatrolPoint[]>;
