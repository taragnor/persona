export class Tooltip { static init() {
    $(document).on("mouseenter", ".tooltip", ev => {
      const target= $(ev.currentTarget) as JQuery<HTMLElement>;
      const $root = Tooltip.ensureTooltipRoot();
      const $content = $(target).find(".tooltiptext").first();
      if ($content.length === 0) {return;}
      const $tooltip = $content.clone().removeAttr("hidden").addClass("tooltip-box");
      $root.append($tooltip);
      const {left, top} = Tooltip.calculateTooltipPosition(target[0], $tooltip[0]);
      // const rect = this.getBoundingClientRect();
      // const top =  rect.top + window.scrollY - $tooltip.outerHeight()! - 8;
      // const boundedTop = Math.max(top, 0); //bounds this so it oesn't go out of screen
      // const left = rect.left + window.scrollX + rect.width / 2;
      $tooltip.css({
        top: `${top}px`,
        left: `${left}px`,
        transform: "translateX(-50%)"
      });
      requestAnimationFrame(() => $tooltip.addClass("visible"));
    });

    $(document).on("mouseleave", ".tooltip", function (this: HTMLElement) {
      $("#tooltip-root .tooltip-box").each(function () {
        $(this).remove();
      });
    });
    console.log("Tooltip listeners added");
  }

  static ensureTooltipRoot(): JQuery<HTMLElement> {
    let $root = $("#tooltip-root");
    if ($root.length === 0) {
      $root = $("<div>", { id: "tooltip-root" }).appendTo("body");
      $root.css({
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 99999
      });
    }
    return $root;
  }

  static calculateTooltipPosition(
    target: HTMLElement,
    tooltip: HTMLElement,
    margin = 20
  ) : TooltipPosition {
    const t = target.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const ttstats = {
      width: tt.width,
      height: tt.height,
    }; //for some reason didn't want to unpack tt normally
    const candidates = [
      // Below
      {
        ...ttstats,
        left: t.left,
        top: t.bottom + margin,
      },

      // Above
      {
        ...ttstats,
        left: t.left,
        top: t.top - tt.height - margin,
      },
      // Right
      {
        ...ttstats,
        left: t.right + margin,
        top: t.top,
      },

      // Left
      {
        ...ttstats,
        left: t.left - tt.width - margin,
        top: t.top,
      },


    ];

    for (const pos of candidates) {
      //still has some bugs not sure why this won't detect overlap
      const fitsViewport =
        pos.left >= 0 &&
        pos.top >= 0 &&
        pos.left + tt.width <= viewportWidth &&
        pos.top + tt.height <= viewportHeight ;

      if (fitsViewport &&
      !this.rectanglesIntersect(pos, t)) {
        return pos;
      }
    }
    console.warn("Can't find fit for viewport");
    // Last resort: clamp
    return {
      left: Math.max(
        0,
        Math.min(t.right + margin, viewportWidth - tt.width)
      ),
      top: Math.max(
        0,
        Math.min(t.top, viewportHeight - tt.height)
      ),
    };

  }

  static rectanglesIntersect(
    a: Rect,
    b: Rect
  ): boolean {
    const ra = this.getRect(a);
    const rb = this.getRect(b);
    //debug for finding that weird error
    // console.log(ra);
    // console.log(rb);
    return !(
      ra.right <= rb.left ||
      ra.left >= rb.right ||
      ra.bottom <= rb.top ||
      ra.top >= rb.bottom
    );
  }

  static getRect(
    {left, top, width, height} : Rect) {
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

}

interface TooltipPosition {
  left: number;
  top: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

