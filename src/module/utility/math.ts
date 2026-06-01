export class MathUtilityFunctions {
  static init() {
    Math.scalePercentage = function scalePercentage(percent: number, multiplier: number): number {
      return 1 + (percent - 1) * multiplier;
    };
  }
}


declare global {
  interface Math {
    scalePercentage(percent: number, multiplier: number): number;
  }
}


