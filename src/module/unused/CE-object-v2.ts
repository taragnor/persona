/* eslint-disable @typescript-eslint/no-unused-vars */

type Conditional<O extends object> = CEItem<O>  & {resolve: (gs: Situation) => boolean};

interface CEItem<O extends object = object> {
  /** resolve this with a gamestate to get its value for either a conditional or consequnces */

  resolve(gamestate: Situation) : unknown;

  /** HMTL to get this on a sheet */
  HTMLInput(): string;

  /** printing for user*/
  userPrint() : string

  /**conditional object as data*/
  object : O;

  deepObject(): O & object;

}


interface MenuI< O extends object=object, Children extends ChildrenT = ChildrenT, Selector extends (keyof Children)[] = (keyof Children)[] > extends CEItem< O>{

  children : Children;

  deepObject() : O & GetObjectsOf< Selector[number], Children>;

}

type ChildrenT = Record<string, Constructor<CEItem>> ;

type GetObjectsOf<K extends keyof O, O extends Record<string, Constructor<CEItem>>> = InstanceType<O[K]>["object"];

type PropertyValues<
  T,
  K extends keyof ValueOf<T>
  > = ValueOf<T>[K];

type ValueOf<T> = T[keyof T];

abstract class Base<O extends object= object> implements CEItem<O> {
  object: Readonly<O>;

  abstract components: Record<string, CEItem>;

  constructor (object: O) {
    this.object = object;
  }

  abstract resolve (gamestate: Situation) : unknown;
  abstract HTMLInput(): string;
  abstract userPrint(): string;

  deepObject() {
    const componentObj =
      Object.fromEntries(
        Object.entries(this.components)
        .map ( ([k,v]) => [`_${k}`, v])
      );

    return {
      ...this.object,
      ...componentObj,
    };
  }
}

abstract class NumberItem extends Base {
  components= {};
  abstract override resolve() : number
};

class SmallNum extends NumberItem {

  static get label() {return "SmallNum" as const;}

  override resolve() {return this.object.data;}
  declare object: {
    data: 1 | 2 | 3;
  };

  HTMLInput() {return "";}
  userPrint() {return "";}
}

class BigNum extends NumberItem {
  static get label() {return "BigNum" as const;}

  declare object: {
    bigdata: 10 | 20 | 30;
  };
  override resolve() {return this.object.bigdata;}
  HTMLInput() {return "";}
  userPrint() {return "";}
}




abstract class Menu<const O extends object = object, const Children extends ChildrenT = ChildrenT> extends Base<O> implements MenuI<O, Children> {
  declare object: MenuI<O, Children>["object"];

  children: Children;

  constructor(object : O, children : Children) {
    super(object);
    this.children = children;
  }

}

class NumberMenu extends Menu<{numType: "big" | "small"}, Record<"big" | "small", typeof SmallNum | typeof BigNum>> {
  components: {
    "numberType": (SmallNum | BigNum),
  };

  static get label() {return "NumberMenu" as const;}


  resolve()  {
    return this.components["numberType"].resolve();
  }

  HTMLInput() {return "";}
  userPrint() {return "";}

  analyzeObject() {
  }
}

export const CEConstructorList = [
  NumberMenu,
  SmallNum,
  BigNum,
] as const satisfies LabeledConstructor<Base>[];

type XXX = typeof BigNum["label"];

type R = typeof CEConstructorList;
type X = ArrayToRecordByKey<typeof CEConstructorList, "label">;


type ArrayToRecord< T extends readonly { label: PropertyKey }[]
  > = {
    [K in T[number] as K["label"]]: K
  };

type Constructor<T = object> = new (...args: unknown[]) => T;

type LabeledConstructor<T = object> = Constructor<T> & {label: string};

type omnirec = Record<string, unknown>;

type ArrayToRecordByKey<
  T extends readonly unknown[],
  K extends PropertyKey
  > = {
    [P in T[number] as P extends Record<K, PropertyKey>
      ? P[K]
      : never]: P
  };
