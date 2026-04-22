
type x =
  {x: 5, z:1}
  | {x: number  | undefined, z:1}
  | {y: 5}


type RRR = NonNullableProps<HasKey<Situation, "attacker">>["attacker"];


