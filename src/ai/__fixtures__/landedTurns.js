// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-017`: what each `landingScenarios.js` turn landed **before** the landing moved to
 * `mergeFrom` — recorded by running the old `forkChange` + `landFork` code on 2026-10-14, not
 * derived from the new code. Record lines, each row's origin and intent, the rollback marker and
 * the outcome's id lists. Regenerate only if a scenario changes, and only from a build that is
 * known to land correctly.
 *
 * @module ai/__fixtures__/landedTurns
 */

/** @type {Record<string, { recordLines: string, entries: Array<{ id: string, origin: string, intent?: string }>, rollbackAt: number | null, recordIds: string[], revisedIds: string[], removedIds: string[] }>} */
export const LANDED_TURNS = {
  "cube minus sphere on an empty project": {
    "recordLines": "{\"id\":\"cuboid-abcdef-1\",\"op\":\"primitive.cuboid\",\"name\":\"Cube 1\",\"params\":{\"size\":[20,20,20],\"center\":[0,0,10]}}\n{\"id\":\"sphere-abcdef-2\",\"op\":\"primitive.sphere\",\"name\":\"Sphere 1\",\"params\":{\"diameter\":20,\"center\":[10,0,10]}}\n{\"id\":\"bool-abcdef-3\",\"op\":\"boolean.subtract\",\"name\":\"Subtract 1\",\"target\":\"cuboid-abcdef-1\",\"operands\":[\"sphere-abcdef-2\"],\"consumes\":[\"cuboid-abcdef-1\",\"sphere-abcdef-2\"]}\n",
    "entries": [
      {
        "id": "cuboid-abcdef-1",
        "origin": "ai",
        "intent": "A cube with a ball cut out\n— Base block"
      },
      {
        "id": "sphere-abcdef-2",
        "origin": "ai",
        "intent": "A cube with a ball cut out"
      },
      {
        "id": "bool-abcdef-3",
        "origin": "ai",
        "intent": "A cube with a ball cut out"
      }
    ],
    "rollbackAt": null,
    "recordIds": [
      "cuboid-abcdef-1",
      "sphere-abcdef-2",
      "bool-abcdef-3"
    ],
    "revisedIds": [],
    "removedIds": []
  },
  "a sphere at the rollback marker": {
    "recordLines": "{\"id\":\"cone-qqqqqq-1\",\"op\":\"primitive.cone\",\"name\":\"Cone 1\",\"params\":{\"diameter\":40,\"height\":50,\"center\":[-50,0,25]}}\n{\"id\":\"sphere-abcdef-3\",\"op\":\"primitive.sphere\",\"name\":\"Sphere 1\",\"params\":{\"diameter\":20,\"center\":[10,0,10]}}\n{\"id\":\"cuboid-qqqqqq-2\",\"op\":\"primitive.cuboid\",\"name\":\"Cube 1\",\"params\":{\"size\":[40,40,40],\"center\":[50,0,20]}}\n",
    "entries": [
      {
        "id": "cone-qqqqqq-1",
        "origin": "local"
      },
      {
        "id": "sphere-abcdef-3",
        "origin": "ai",
        "intent": "ball"
      },
      {
        "id": "cuboid-qqqqqq-2",
        "origin": "local"
      }
    ],
    "rollbackAt": 2,
    "recordIds": [
      "sphere-abcdef-3"
    ],
    "revisedIds": [],
    "removedIds": []
  },
  "define, bind and set piModel (rows added and revised)": {
    "recordLines": "{\"id\":\"pi-1\",\"op\":\"raspberrypi.bplus\",\"name\":\"Raspberry Pi 1\",\"params\":{\"model\":{\"$var\":\"piModel\"}}}\n{\"id\":\"pi-1-move\",\"op\":\"transform.translate\",\"target\":\"pi-1\",\"supersedes\":\"pi-1\",\"params\":{\"vector\":[10,5,0],\"rotation\":[0,0,0]}}\n{\"id\":\"cube-1\",\"op\":\"primitive.cuboid\",\"name\":\"Cube 1\",\"params\":{\"size\":[6,6,6],\"center\":[120,20,3]}}\n{\"id\":\"var-abcdef-1\",\"op\":\"var.define\",\"params\":{\"name\":\"piModel\",\"kind\":\"enum\",\"value\":5,\"options\":[{\"value\":4,\"label\":\"Pi 4\"},{\"value\":5,\"label\":\"Pi 5\"}]}}\n",
    "entries": [
      {
        "id": "pi-1",
        "origin": "local"
      },
      {
        "id": "pi-1-move",
        "origin": "local"
      },
      {
        "id": "cube-1",
        "origin": "local"
      },
      {
        "id": "var-abcdef-1",
        "origin": "ai",
        "intent": "make the Pi model a variable\n— One switch for the board"
      }
    ],
    "rollbackAt": null,
    "recordIds": [
      "var-abcdef-1"
    ],
    "revisedIds": [
      "pi-1"
    ],
    "removedIds": []
  },
  "delete_variable with keepValues (a row removed)": {
    "recordLines": "{\"id\":\"pi-1\",\"op\":\"raspberrypi.bplus\",\"name\":\"Raspberry Pi 1\",\"params\":{\"model\":5}}\n{\"id\":\"pi-1-move\",\"op\":\"transform.translate\",\"target\":\"pi-1\",\"supersedes\":\"pi-1\",\"params\":{\"vector\":[10,5,0],\"rotation\":[0,0,0]}}\n{\"id\":\"cube-1\",\"op\":\"primitive.cuboid\",\"name\":\"Cube 1\",\"params\":{\"size\":[6,6,6],\"center\":[120,20,3]}}\n",
    "entries": [
      {
        "id": "pi-1",
        "origin": "local"
      },
      {
        "id": "pi-1-move",
        "origin": "local"
      },
      {
        "id": "cube-1",
        "origin": "local"
      }
    ],
    "rollbackAt": null,
    "recordIds": [],
    "revisedIds": [
      "pi-1"
    ],
    "removedIds": [
      "var-qqqqqq-1"
    ]
  }
}
