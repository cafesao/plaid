declare namespace NodeJS {
  type Timeout = number;
  interface Global {}
}

declare function require(module: string): any;
