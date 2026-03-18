import {RandomDungeonGenerator} from "./random-dungeon-generator.js";

  const scene = {
    name : "Test Scene",
    baseDungeonLevel: 1,
    grid: {
      size: 50,
    },
    getSceneModifiers() { return [];},
    dimensions : {
      sceneRect: {
        x: 0, y: 0, width: 3000, height:3000} ,
    }
  };

  const TreasureSystem = {
    generate(_diff: number, _mod: number){ return [];}
  };

function main() {


  const maxSquares = 50;
  for (let i = 5; i < maxSquares; i+=5) {
    console.log(`Testing with ${i} squares`);
    try {
      testWith(i);
      console.log("PASS");
    } catch {
      console.log("FAIL");
    }
  }
}

function testWith(sq: number) {
  const lvl = 5;
  const dimensions = {
    height: 10,
    width: 10,
  };
  const gen = new RandomDungeonGenerator(dimensions, lvl, []);
  gen.generate(sq, `${lvl}ARGFDSS` + String(Date.now()));
}


main();
