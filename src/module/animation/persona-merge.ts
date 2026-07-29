
type ImageContainer = { img: string; };

export class FusionAnimation {

  public static async fuse( persona1: ImageContainer, persona2: ImageContainer, targetPersona: ImageContainer, duration ?: number) : Promise<void> {
    return this.playCardFusionAnimation(persona1.img, persona2.img, targetPersona.img, duration);
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

      overlay.innerHTML = `
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
              ${Array.from({ length: 32 }, () => "<span></span>").join("")}
            </div>
        `;

                const particles = overlay.querySelectorAll(".fusion-particles span");

                particles.forEach((particle : HTMLElement) => {

                  particle.style.setProperty("--x", (35 + Math.random() * 30).toString());
                  particle.style.setProperty("--y", (55 + Math.random() * 25).toString());

                  particle.style.setProperty("--delay", Math.random().toString());
                  particle.style.setProperty("--speed", Math.random().toString());
                  particle.style.setProperty(
                    "--drift",
                    (Math.random() * 2 - 1).toFixed(2)
                  );
                });
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

    border:4px solid #d9d2a8;
    border-radius:12px;

    background:#111;

    box-shadow:
        0 0 25px rgba(255,255,255,.25),
        inset 0 0 0 2px rgba(255,255,255,.15);

    overflow:hidden;
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

    animation:leftCard 2.2s forwards;
}

.play .right{

    animation:rightCard 2.2s forwards;
}

.play .fusion-flash{

    animation:flash 1s 1.9s forwards;
}

.play .result{

    animation:resultCard 1.4s 2.3s forwards;
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

.fusion-particles span {
    position: absolute;

    width: 14px;
    height: 32px;

    left: calc(var(--x) * 1%);
    top: calc(var(--y) * 1%);

    border-radius: 50% 50% 45% 45%;

    background:
        radial-gradient(circle at 50% 70%,
            #dffbff 0%,
            #86eaff 35%,
            #2bbcff 70%,
            rgba(0,160,255,0) 100%);

    filter:
        blur(2px)
        drop-shadow(0 0 8px #59d7ff)
        drop-shadow(0 0 18px #28a7ff);

    opacity: 0;

    transform-origin: center bottom;

    animation:
        blueFlameRise
        calc(1.8s + var(--speed) * 1s)
        linear
        infinite;

    animation-delay:
        calc(var(--delay) * -2s);
}

.play .fusion-particles span {
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

    100%{
        transform:
            translate(
                calc(var(--drift) * 24px),
                -140px)
            scale(1.8)
            rotate(8deg);

        opacity:0;
    }
}
`;
  document.head.appendChild(style);
}

