
type ImageContainer = { img: string; };

export class FusionAnimation {

  public static async fuse( persona1: ImageContainer, persona2: ImageContainer, targetPersona: ImageContainer, duration ?: number) : Promise<void> {
    return this.playCardFusionAnimation(persona1.img, persona2.img, targetPersona.img, duration);
  }

  private static createParticleAnimation(overlay: HTMLElement) {
    const particles = overlay.querySelectorAll(".fusion-particles .particle");
    particles.forEach((particle : HTMLElement) => {
      particle.style.setProperty("--x", (35 + Math.random() * 30).toString());
      particle.style.setProperty("--y", (55 + Math.random() * 25).toString());
      particle.style.setProperty("--delay", Math.random().toString());
      particle.style.setProperty("--speed", Math.random().toString());
      particle.style.setProperty(
        "--drift",
        (Math.random() * 2 - 1).toFixed(2)
      );
      const x = 35 + Math.random() * 30;
      const y = 55 + Math.random() * 25;

      particle.style.setProperty("--x", x.toString());
      particle.style.setProperty("--y", y.toString());

      // Distance from particle to screen center (50%,50%)
      particle.style.setProperty("--targetX", (50 - x).toFixed(2));
      particle.style.setProperty("--targetY", (50 - y).toFixed(2));
    });

    setTimeout(() => {
      overlay.classList.add("fusion-active");
    }, 1800);
  }

  private static createInnerHTML(
    leftImage: string,
    rightImage: string,
    resultImage: string,
  ) {
      return `
          <div class="fusion-card left">
              <img src="${leftImage}">
          </div>

          <div class="fusion-card right">
              <img src="${rightImage}">
          </div>

          <div class="fusion-flash"></div>

          <div class="fusion-card result">
            <img src="${resultImage}">
          </div>
          <div class="fusion-particles">
              ${Array.from({ length: 32 }, () => "<div class='particle'> <span></span> </div>").join("")}
          </div>
        `;

  }

  private static playCardFusionAnimation(
    leftImage: string,
    rightImage: string,
    resultImage: string,
    duration = 4500
  ): Promise<void> {

    return new Promise(resolve => {

      injectStyles();

      const overlay = document.createElement("div");
      overlay.className = "fusion-overlay";

      overlay.innerHTML = this.createInnerHTML(leftImage, rightImage, resultImage);
      this.createParticleAnimation(overlay);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.classList.add("play");
      });

      setTimeout(() => {
        overlay.remove();
        resolve();
      }, duration);
    });
  }

  }

  let stylesInjected = false;

  function injectStyles() {

    if (stylesInjected) {return;}
    stylesInjected = true;

    const style = document.createElement("style");

    style.textContent = `

.fusion-overlay{
    position:fixed;
    inset:0;
    overflow:hidden;
    pointer-events:none;
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:999999;
}

.fusion-card{
    position:absolute;

    width:220px;
    height:360px;

    opacity:0;

    border:4px solid #d9f7ff;
    border-radius:12px;

    background:#111;

    box-shadow:
        0 0 25px rgba(255,255,255,.25),
        inset 0 0 0 2px rgba(255,255,255,.15);

    overflow:hidden;
}

.fusion-card.result {
    border-color:#bdefff;
}

.fusion-card::before{
    content:"";
    position:absolute;
    inset:8px;

    border:2px solid rgba(255,255,255,.35);
    border-radius:6px;

    pointer-events:none;
}

.fusion-card img{

    width:100%;
    height:100%;
    object-fit:cover;
}

.left{
    left:-260px;
}

.right{
    right:-260px;
}

.result{
    left:50%;
    top:50%;
    transform:
        translate(-50%,-50%)
        scale(.2);

    opacity:0;
}


.play .left{
    animation:leftCard 3.5s forwards;
}

.play .right{
    animation:rightCard 3.5s forwards;
}

.play .fusion-flash{

    animation:flash 1s 1.9s forwards;
}

.play .result{

    animation:
        resultCard 1.8s 3.6s forwards,
        resultGlow 2s 5.0s infinite alternate;

}

.fusion-flash{

    position:absolute;

    width:200px;
    height:200px;

    border-radius:50%;

    background:white;

    opacity:0;

    filter:blur(40px);
}


@keyframes leftCard{

0%{

left:-260px;
opacity:0;
transform:translateY(0) scale(.9);
}

20%{

opacity:1;
}

50%{

left:calc(50% - 180px);
opacity:1;
transform:scale(1);
}

75%{

left:50%;
transform:
translateX(-50%)
scale(.4);

opacity:.25;

filter:brightness(2);
}

100%{

left:50%;
transform:
translateX(-50%)
scale(.05);

opacity:0;
}
}

@keyframes rightCard{

0%{

right:-260px;
opacity:0;
transform:scale(.9);
}

20%{

opacity:1;
}

50%{

right:calc(50% - 180px);
opacity:1;
transform:scale(1);
}

75%{

right:50%;
transform:
translateX(50%)
scale(.4);

opacity:.25;
filter:brightness(2);
}

100%{

right:50%;
transform:
translateX(50%)
scale(.05);

opacity:0;
}
}

@keyframes flash{

0%{

opacity:0;
transform:scale(.2);
}

40%{

opacity:.9;
transform:scale(1.8);
}

100%{

opacity:0;
transform:scale(3);
}
}

@keyframes resultCard{

0%{

opacity:0;
transform:
translate(-50%,-50%)
scale(.2);

filter:brightness(3);
}

60%{

opacity:1;
transform:
translate(-50%,-50%)
scale(1.12);
}

100%{

opacity:1;
transform:
translate(-50%,-50%)
scale(1);
}
}

.fusion-particles {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
}

.fusion-particles .particle span{

    display:block;

    width:14px;
    height:32px;

    border-radius:50% 50% 45% 45%;

    background:
        radial-gradient(circle at 50% 70%,
            #ffffff 0%,
            #86eaff 30%,
            #2bbcff 60%,
            rgba(0,160,255,0) 100%);

    filter:
        blur(2px)
        drop-shadow(0 0 8px #59d7ff)
        drop-shadow(0 0 18px #28a7ff);

    animation:
        blueFlameRise
        calc(1.8s + var(--speed) * 1s)
        linear
        infinite;

    animation-delay:
        calc(var(--delay) * -2s);
}

.particle{

    position:absolute;

    left:calc(var(--x) * 1%);
    top:calc(var(--y) * 1%);

    pointer-events:none;
}
.play .fusion-particles .particle {
    opacity: 1;
}

@keyframes blueFlameRise {

    0%{
        transform:
            translate(0,0)
            scale(.3)
            rotate(-6deg);

        opacity:0;
    }

    15%{
        opacity:.9;
    }

    50%{
        transform:
            translate(
                calc(var(--drift) * 8px),
                -60px)
            scale(.9)
            rotate(4deg);
    }

  70%{
    opacity:.9;

    transform:
        translate(
            calc(var(--drift) * 12px),
            -70px)
        scale(1);
}

100%{
    opacity:0;

    transform:
        translate(
            calc(var(--targetX) * 1vw),
            calc(var(--targetY) * 1vh))
        scale(.1)
        rotate(180deg);

  filter:
  blur(8px)
  drop-shadow(0 0 20px #9beeff);
}
}


@keyframes particleMerge{

0%{

    transform:
        translate(0,0)
        scale(1);
}

100%{

    transform:
        translate(
            calc(var(--targetX) * 1vw),
            calc(var(--targetY) * 1vh)
        )
        scale(.15);

    opacity:0;
}
}

.fusion-active .particle{

    animation:
        particleMerge
        .7s
        ease-in
        forwards;
}

@keyframes resultGlow {

    0% {
        box-shadow:
            0 0 20px rgba(80,200,255,.3),
            0 0 40px rgba(80,200,255,.2);
    }

    50% {
        box-shadow:
            0 0 35px rgba(120,220,255,.9),
            0 0 80px rgba(80,180,255,.7),
            0 0 120px rgba(50,150,255,.4);
    }

    100% {
        box-shadow:
            0 0 20px rgba(80,200,255,.4),
            0 0 50px rgba(80,180,255,.3);
    }
}

.fusion-card.result::after {

    content:"";

    position:absolute;
    inset:-50%;

    background:
        linear-gradient(
            120deg,
            transparent 40%,
            rgba(255,255,255,.7),
            transparent 60%
        );

    transform:translateX(-100%) rotate(20deg);

    animation:
        cardShimmer
        1.2s
        5.2s
        forwards;
}

@keyframes cardShimmer {

    to {
        transform:translateX(100%) rotate(20deg);
    }
}
`;

    document.head.appendChild(style);
  }

