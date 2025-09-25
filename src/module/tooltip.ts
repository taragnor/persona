export class Tooltip {
	static init() {
		$(document).on("mouseenter", ".tooltip", function (this: HTMLElement) {
			const $root = Tooltip.ensureTooltipRoot();
			
			const $content = $(this).find(".tooltiptext").first();
			if ($content.length === 0) {return;}
			
			const $tooltip = $content.clone().removeAttr("hidden").addClass("tooltip-box");
			$root.append($tooltip);
			
			const rect = this.getBoundingClientRect();
			const top = rect.top + window.scrollY - $tooltip.outerHeight()! - 8;
			const left = rect.left + window.scrollX + rect.width / 2;
			
			$tooltip.css({
				top: `${top}px`,
				left: `${left}px`,
				transform: "translateX(-50%)"
			});
			
			requestAnimationFrame(() => $tooltip.addClass("visible"));
		});

		$(document).on("mouseleave", ".tooltip", function (this: HTMLElement) {
			console.log("Mouse Leave!");
			$("#tooltip-root .tooltip-box").each(function () {
				$(this).remove();
				// const $tip = $(this);
				// if ($tip.data("source") === (this)) {
				// 	$tip.remove(); // remove this tooltip
				// }
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
}
