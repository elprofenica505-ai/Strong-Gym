import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_PART_LABELS,
  BODY_PART_ORDER,
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  EQUIPMENT_GROUPS,
  EQUIPMENT_LABELS,
  EXERCISE_ATTRIBUTION,
  GOAL_LABELS,
  MUSCLE_LABELS,
  bodyPartLabel,
  equipmentGroupSlugs,
  equipmentLabel,
  muscleLabel,
} from "../src/lib/exercises/terms.ts";

/**
 * El catálogo habla en inglés técnico y el socio en español.
 *
 * Estas listas son la **foto real del dataset** (701 ejercicios). Si mañana el
 * origen agrega un músculo o un equipo nuevo, esta prueba falla antes de que un
 * socio vea `smith_machine` crudo en la pantalla.
 */
const MUSCLES = [
  "abductors", "adductors", "anterior_deltoid", "biceps_brachii", "brachialis",
  "brachioradialis", "erector_spinae", "forearm_extensors", "forearm_flexors",
  "forearms", "gastrocnemius", "gluteus_maximus", "gluteus_medius", "hamstrings",
  "hip_flexors", "infraspinatus_teres_minor", "lateral_deltoid", "latissimus_dorsi",
  "obliques", "pectoralis_major", "posterior_deltoid", "quadratus_lumborum",
  "quadriceps", "rectus_abdominis", "rhomboids", "serratus_anterior", "soleus",
  "supraspinatus", "tibialis_anterior", "transverse_abdominis", "trapezius",
  "triceps_brachii",
];

const EQUIPMENT = [
  "ab_crunch_machine", "ab_wheel", "air_bike", "assisted_pullup_machine",
  "back_extension_machine", "barbell", "battle_rope", "bicep_curl_machine",
  "bicycle", "bosu_ball", "cable", "chest_fly_machine", "chest_press_machine",
  "climbing_rope", "dip_machine", "dip_station", "donkey_calf_raise_machine",
  "dumbbell", "elliptical", "ez_bar", "flat_bench", "glute_ham_developer",
  "hack_squat", "hip_abduction_machine", "hip_adduction_machine",
  "hip_thrust_machine", "jump_rope", "kettlebell", "lat_pulldown_machine",
  "leg_curl", "leg_extension", "leg_press", "loop_band", "medicine_ball",
  "pec_deck", "plate_loaded_dip_machine", "plate_loaded_lateral_raise_machine",
  "plates", "plyo_box", "preacher_curl_machine", "pull_up_bar",
  "resistance_band", "reverse_fly_machine", "rings", "rower", "sandbag",
  "seated_calf_raise_machine", "seated_row_machine", "shoulder_press_machine",
  "shrug_machine", "ski_erg", "slam_ball", "sled", "smith_machine",
  "stability_ball", "stair_climber", "standing_calf_raise_machine",
  "stationary_bike", "suspension_trainer", "trap_bar", "treadmill",
  "tricep_extension_machine", "wall_ball", "wrist_roller",
];

test("cada músculo del dataset tiene nombre en español", () => {
  for (const key of MUSCLES) {
    assert.ok(MUSCLE_LABELS[key], `falta la etiqueta de ${key}`);
    assert.doesNotMatch(MUSCLE_LABELS[key], /_/, `${key} no puede mostrarse como slug`);
  }
});

test("cada equipo del dataset tiene nombre en español", () => {
  for (const key of EQUIPMENT) {
    assert.ok(EQUIPMENT_LABELS[key], `falta la etiqueta de ${key}`);
  }
});

test("las zonas, categorías, niveles y objetivos están completos", () => {
  for (const key of ["chest", "back", "shoulders", "upper_arms", "lower_arms", "core", "upper_legs", "lower_legs", "full_body"]) {
    assert.ok(BODY_PART_LABELS[key], `falta la zona ${key}`);
  }
  for (const key of ["strength", "stretching", "cardio", "olympic", "plyometrics"]) {
    assert.ok(CATEGORY_LABELS[key], `falta la categoría ${key}`);
  }
  for (const key of ["beginner", "intermediate", "advanced"]) {
    assert.ok(DIFFICULTY_LABELS[key], `falta el nivel ${key}`);
  }
  for (const key of ["hypertrophy", "strength", "endurance", "mobility", "power", "rehabilitation", "core"]) {
    assert.ok(GOAL_LABELS[key], `falta el objetivo ${key}`);
  }
});

test("el orden de las zonas cubre todas y empieza por el torso", () => {
  assert.deepEqual([...BODY_PART_ORDER].sort(), Object.keys(BODY_PART_LABELS).sort());
  assert.equal(BODY_PART_ORDER[0], "chest");
});

test("los grupos de equipo apuntan a equipos que existen", () => {
  const known = new Set(EQUIPMENT);
  for (const group of EQUIPMENT_GROUPS) {
    assert.ok(group.label && group.hint, `${group.key} necesita nombre y explicación`);
    for (const slug of group.slugs) {
      assert.ok(known.has(slug), `${group.key} menciona ${slug}, que no está en el catálogo`);
    }
  }
  // Todo equipo real cae en algún grupo, salvo los que se agrupan como «otros».
  const grouped = new Set(EQUIPMENT_GROUPS.flatMap((group) => group.slugs));
  const leftovers = EQUIPMENT.filter((slug) => !grouped.has(slug));
  assert.deepEqual(leftovers, [], `equipos sin grupo: ${leftovers.join(", ")}`);
});

test("«máquinas» trae las máquinas de sala y no el peso libre", () => {
  const machines = equipmentGroupSlugs("maquinas");
  assert.ok(machines?.includes("leg_press"));
  assert.ok(machines?.includes("lat_pulldown_machine"));
  assert.ok(machines?.includes("smith_machine"));
  assert.ok(!machines?.includes("barbell"));
  assert.equal(equipmentGroupSlugs("no-existe"), null);
});

test("una etiqueta que falta se muestra legible, nunca como slug", () => {
  assert.equal(muscleLabel("nuevo_musculo"), "nuevo musculo");
  assert.equal(bodyPartLabel("lower_legs"), "Pantorrilla");
  assert.equal(equipmentLabel(null), "Peso corporal");
  assert.equal(equipmentLabel("leg_press"), "Prensa de piernas");
});

test("la atribución del dataset es exactamente la que exige la licencia", () => {
  assert.equal(EXERCISE_ATTRIBUTION.text, "Exercise data by RepDB (repdb.co)");
  assert.equal(EXERCISE_ATTRIBUTION.href, "https://repdb.co");
});
