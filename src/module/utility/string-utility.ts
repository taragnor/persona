export class StringUtilities {
  /** replaces inside double braces with the result of the function*/
  static replaceStr(
    input: string,
    resolver: (str: string) => string
  ): string {
    return input.replace(/\{\{(.*?)\}\}/g, (_, str: string) => {
      return resolver(str);
    });
  }

}
