import {SYSTEMPATH} from "../../config/persona-settings.js";

interface ShuffleCard {
  imgPath: string;
  effect: () => MaybePromise<void>;
}


export class ShuffleTimeApplication extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
)  {

  private cards: ShuffleCard[];

  private shuffleSpeed: number;
  private shuffleDuration: number;

  private resolve?: (card: ShuffleCard) => void;


  constructor(
    cards: ShuffleCard[],
    options: {
      shuffleSpeed?: number;
      shuffleDuration?: number;
    } = {}
  ) {
    super();
    this.cards = cards;
    this.shuffleSpeed =
      options.shuffleSpeed ?? 150;
    this.shuffleDuration =
      options.shuffleDuration ?? 4000;
  }


  static async run <CardType extends ShuffleCard>(
    cards: CardType[],
    options?: {
      shuffleSpeed?: number;
      shuffleDuration?: number;
    }
  ): Promise<CardType> {

    return new Promise(resolve => {
      const app =
        new ShuffleTimeApplication(
          cards,
          options
        );

      app.resolve = resolve as (card: ShuffleCard) => void;
      void app.render(true);
    });
  }


  static override DEFAULT_OPTIONS = {

    id:"persona-shuffle",

    classes:[
      "shuffle-time"
    ],

    window:{
      frame:false,
      positioned:false
    },

    popOut:false,

    actions:{
      chooseCard:
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ShuffleTimeApplication.chooseCard
    }
  };


  static PARTS = {

    main:{
      template:
      `${SYSTEMPATH}/module/shuffleTime/shuffle-time.hbs`
    }

  };


  override _prepareContext(){
    return {
      cards:this.cards
    };

  }


  override async _onRender(){

    await super._onRender();

    await this.sleep(1000);

    await this.flipCards();

    await this.shuffle();

    this.element.classList.add("choose");

  }


  private async flipCards(){

    const cards =
      this.element.querySelectorAll(".shuffle-card");


    cards.forEach(card =>
      card.classList.add("flipped")
    );


    await this.sleep(900);

  }



  private async shuffle(){

    const container =
      this.element.querySelector(
        ".shuffle-cards"
      ) as HTMLElement;


    const cards =
      Array.from(
        container.querySelectorAll(
          ".shuffle-card"
        )
      );


    const end =
      Date.now() + this.shuffleDuration;


    while(Date.now() < end){

      const a =
        Math.floor(
          Math.random()*cards.length
        );

      const b =
        Math.floor(
          Math.random()*cards.length
        );


      if(a===b)
      {continue;}


      this.swapCards(
        cards[a] as HTMLElement,
        cards[b] as HTMLElement
      );


      await this.sleep(
        this.shuffleSpeed
      );
    }

  }



  private swapCards(
    a:HTMLElement,
    b:HTMLElement
  ){

    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const ax = bRect.left-aRect.left;
    const ay = bRect.top-aRect.top;
    const bx = aRect.left-bRect.left;
    const by = aRect.top-bRect.top;
    a.style.transform = `translate(${ax}px,${ay}px)`;
    b.style.transform = `translate(${bx}px,${by}px)`;


    setTimeout(()=>{

      a.style.transform="";
      b.style.transform="";

      const parent =
        a.parentElement!;

      const next =
        a.nextSibling;

      parent.insertBefore(
        a,
        b
      );

      if(next)
      {parent.insertBefore(
        b,
        next
      );}

    }, this.shuffleSpeed-20);

  }



  static async chooseCard(
    this:ShuffleTimeApplication,
    _event:PointerEvent,
    target:HTMLElement
  ){
    if ( !this.element.classList.contains( "choose"))
    {return;}
    const card =
      target.closest(
        ".shuffle-card"
      ) as HTMLElement;
    if (!card)
    {return;}
    card.classList.add(
      "selected"
    );
    await this.sleep(800);
    card.classList.remove(
      "flipped"
    );
    await this.sleep(1200);
    const index =
      Number(
        card.dataset.index
      );
    const chosen = this.cards[index];
    await chosen.effect();
    this.resolve?.(chosen);
    await this.close();
  }



  private sleep(ms:number){

    return new Promise(
      r=>setTimeout(r,ms)
    );

  }

}
