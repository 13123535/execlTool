/**
 * 公式引擎 — 词法 + 语法解析器
 *
 * 将公式字符串解析为 AST。
 *
 * 语法 (EBNF)：
 *   expr      → comparison (("&&"|"||") comparison)*
 *   comparison → additive ((">"|"<"|">="|"<="|"=="|"!=") additive)?
 *   additive  → multiplicative (("+"|"-") multiplicative)*
 *   mult      → unary (("*"|"/"|"%") unary)*
 *   unary     → ("-"|"!")? primary
 *   primary   → NUMBER | STRING | TRUE | FALSE | NULL | column_ref | function_call | "(" expr ")"
 *   column_ref → "{" IDENT "}"
 *   func_call → IDENT "(" args ")"
 *   args      → expr ("," expr)*
 */

import type { ASTNode } from "./types";

// ═══════════════════════════════════════════════════════════════
// Token 类型
// ═══════════════════════════════════════════════════════════════

type TokenKind =
  | "number"
  | "string"
  | "ident"
  | "lbrace"     // {
  | "rbrace"     // }
  | "lparen"     // (
  | "rparen"     // )
  | "comma"
  | "plus"       // +
  | "minus"      // -
  | "star"       // *
  | "slash"      // /
  | "percent"    // %
  | "gt"         // >
  | "lt"         // <
  | "gte"        // >=
  | "lte"        // <=
  | "eq"         // ==
  | "neq"        // !=
  | "and"        // &&
  | "or"         // ||
  | "not"        // !
  | "true"
  | "false"
  | "null"
  | "eof";

interface Token {
  kind: TokenKind;
  /** 原始字面量 */
  lexeme: string;
  /** 数值型 token 的值 */
  value?: number;
  /** token 在源字符串中的位置（用于错误报告） */
  pos: number;
}

// ═══════════════════════════════════════════════════════════════
// 关键字表
// ═══════════════════════════════════════════════════════════════

const KEYWORDS: Record<string, TokenKind> = {
  true: "true",
  false: "false",
  null: "null",
};

// ═══════════════════════════════════════════════════════════════
// 词法分析器
// ═══════════════════════════════════════════════════════════════

class Lexer {
  private pos = 0;
  private tokens: Token[] = [];

  constructor(private src: string) {}

  tokenize(): Token[] {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];

      // 空白
      if (/\s/.test(ch)) {
        this.pos++;
        continue;
      }

      // 花括号 { }
      if (ch === "{") { this.addToken("lbrace", ch); this.pos++; continue; }
      if (ch === "}") { this.addToken("rbrace", ch); this.pos++; continue; }

      // 圆括号 ( )
      if (ch === "(") { this.addToken("lparen", ch); this.pos++; continue; }
      if (ch === ")") { this.addToken("rparen", ch); this.pos++; continue; }

      // 逗号
      if (ch === ",") { this.addToken("comma", ch); this.pos++; continue; }

      // 运算符（2 字符优先）
      if (ch === ">" && this.peek(1) === "=") { this.addToken("gte", ">="); this.pos += 2; continue; }
      if (ch === "<" && this.peek(1) === "=") { this.addToken("lte", "<="); this.pos += 2; continue; }
      if (ch === "=" && this.peek(1) === "=") { this.addToken("eq", "=="); this.pos += 2; continue; }
      if (ch === "!" && this.peek(1) === "=") { this.addToken("neq", "!="); this.pos += 2; continue; }
      if (ch === "&" && this.peek(1) === "&") { this.addToken("and", "&&"); this.pos += 2; continue; }
      if (ch === "|" && this.peek(1) === "|") { this.addToken("or", "||"); this.pos += 2; continue; }

      // 单字符运算符
      if (ch === "+") { this.addToken("plus", ch); this.pos++; continue; }
      if (ch === "-") { this.addToken("minus", ch); this.pos++; continue; }
      if (ch === "*") { this.addToken("star", ch); this.pos++; continue; }
      if (ch === "/") { this.addToken("slash", ch); this.pos++; continue; }
      if (ch === "%") { this.addToken("percent", ch); this.pos++; continue; }
      if (ch === ">") { this.addToken("gt", ch); this.pos++; continue; }
      if (ch === "<") { this.addToken("lt", ch); this.pos++; continue; }
      if (ch === "!") { this.addToken("not", ch); this.pos++; continue; }

      // 字符串（单引号或双引号）
      if (ch === `"` || ch === `'`) {
        const quote = ch;
        let str = "";
        this.pos++; // skip opening quote
        while (this.pos < this.src.length) {
          const c = this.src[this.pos];
          if (c === "\\" && this.pos + 1 < this.src.length) {
            this.pos++;
            const next = this.src[this.pos];
            if (next === quote) str += quote;
            else if (next === "\\") str += "\\";
            else if (next === "n") str += "\n";
            else if (next === "t") str += "\t";
            else str += next;
            this.pos++;
          } else if (c === quote) {
            this.pos++;
            break;
          } else {
            str += c;
            this.pos++;
          }
        }
        this.addToken("string", str);
        continue;
      }

      // 数字
      if (/[0-9]/.test(ch)) {
        let num = "";
        let startPos = this.pos;
        while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) {
          num += this.src[this.pos];
          this.pos++;
        }
        if ((num.split(".").length - 1) > 1) {
          throw new Error(`[parser] 非法数字 "${num}" 在位置 ${startPos}`);
        }
        this.addToken("number", num, parseFloat(num));
        continue;
      }

      // 标识符（函数名 / 关键字）
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = "";
        while (this.pos < this.src.length && /[a-zA-Z0-9_.]/.test(this.src[this.pos])) {
          ident += this.src[this.pos];
          this.pos++;
        }
        const upper = ident.toUpperCase(); // 函数名大小写不敏感，内部统一大写
        if (KEYWORDS[upper]) {
          this.addToken(KEYWORDS[upper], ident);
        } else {
          this.addToken("ident", upper);
        }
        continue;
      }

      throw new Error(`[parser] 未预期字符 "${ch}" 在位置 ${this.pos}`);
    }
    this.addToken("eof", "EOF");
    return this.tokens;
  }

  private peek(offset: number): string {
    const idx = this.pos + offset;
    return idx < this.src.length ? this.src[idx] : "";
  }

  private addToken(kind: TokenKind, lexeme: string, value?: number): void {
    this.tokens.push({ kind, lexeme, value, pos: this.pos });
  }
}

// ═══════════════════════════════════════════════════════════════
// 语法分析器 (Pratt Parser / Recursive Descent)
// ═══════════════════════════════════════════════════════════════

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parse(): ASTNode {
    const node = this.expression();
    if (this.current().kind !== "eof") {
      throw new Error(`[parser] 意外的 token "${this.current().lexeme}" 在末尾`);
    }
    return node;
  }

  // ── expression 级别：逻辑运算 && || ──

  private expression(): ASTNode {
    return this.binaryLeft(
      () => this.comparison(),
      ["and", "or"],
    );
  }

  // ── comparison 级别：比较运算 > < >= <= == != ──

  private comparison(): ASTNode {
    return this.binaryLeft(
      () => this.additive(),
      ["gt", "lt", "gte", "lte", "eq", "neq"],
    );
  }

  // ── additive 级别：加减 + - ──

  private additive(): ASTNode {
    return this.binaryLeft(
      () => this.multiplicative(),
      ["plus", "minus"],
    );
  }

  // ── multiplicative 级别：乘除取余 * / % ──

  private multiplicative(): ASTNode {
    return this.binaryLeft(
      () => this.unary(),
      ["star", "slash", "percent"],
    );
  }

  // ── unary：一元运算符 - ! ──

  private unary(): ASTNode {
    const tok = this.current();
    if (tok.kind === "minus" || tok.kind === "not") {
      this.advance(); // consume
      const op = tok.kind === "minus" ? "-" : "!";
      return { type: "unary_op", op, operand: this.unary() };
    }
    return this.primary();
  }

  // ── primary：字面量 / 括号 / 列引用 / 函数调用 ──

  private primary(): ASTNode {
    const tok = this.current();

    switch (tok.kind) {
      case "number":
        this.advance();
        return { type: "number", value: tok.value! };

      case "string":
        this.advance();
        return { type: "string", value: tok.lexeme };

      case "true":
        this.advance();
        return { type: "boolean", value: true };

      case "false":
        this.advance();
        return { type: "boolean", value: false };

      case "null":
        this.advance();
        return { type: "null" };

      case "lparen": {
        // ( expr )
        this.advance(); // consume (
        const node = this.expression();
        this.consume("rparen", "期望 ')'");
        return node;
      }

      case "lbrace": {
        // { columnName }
        this.advance(); // consume {
        // peek next is ident or number
        const colToken = this.current();
        if (colToken.kind !== "ident" && colToken.kind !== "number") {
          throw new Error(`[parser] 花括号内期望列名，得到 "${colToken.lexeme}"`);
        }
        this.advance(); // consume column name
        this.consume("rbrace", "期望 '}'");
        return { type: "column_ref", name: colToken.lexeme };
      }

      case "ident": {
        if (this.peek(1)?.kind === "lparen") {
          // function call
          const funcName = tok.lexeme;
          this.advance(); // consume IDENT
          this.advance(); // consume (
          const args: ASTNode[] = [];
          if (this.current().kind !== "rparen") {
            args.push(this.expression());
            while (this.current().kind === "comma") {
              this.advance(); // consume ,
              args.push(this.expression());
            }
          }
          this.consume("rparen", "期望 ')'");
          return { type: "function_call", name: funcName, args };
        }
        // 裸标识符：可能是 TRUE/FALSE/NULL 的另一种拼写
        throw new Error(`[parser] 未预期的标识符 "${tok.lexeme}"`);
      }

      default:
        throw new Error(`[parser] 未预期的 token "${tok.lexeme}" (kind=${tok.kind})`);
    }
  }

  // ── 工具方法 ──

  /** 左结合二元运算符解析模板 */
  private binaryLeft(
    parseSub: () => ASTNode,
    opKinds: TokenKind[],
  ): ASTNode {
    let left = parseSub();
    while (this.current().kind !== "eof" && opKinds.includes(this.current().kind)) {
      const op = this.opLexeme(this.current().kind);
      this.advance();
      const right = parseSub();
      left = { type: "binary_op", op, left, right };
    }
    return left;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { kind: "eof", lexeme: "EOF", pos: -1 };
  }

  private peek(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    return this.tokens[this.pos++] ?? { kind: "eof", lexeme: "EOF", pos: -1 };
  }

  private consume(expected: TokenKind, errMsg: string): void {
    const tok = this.current();
    if (tok.kind !== expected) {
      throw new Error(`[parser] ${errMsg}，得到 "${tok.lexeme}"`);
    }
    this.advance();
  }

  /** 将 token kind 映射为运算符字符串 */
  private opLexeme(kind: TokenKind): string {
    const map: Partial<Record<TokenKind, string>> = {
      plus: "+",
      minus: "-",
      star: "*",
      slash: "/",
      percent: "%",
      gt: ">",
      lt: "<",
      gte: ">=",
      lte: "<=",
      eq: "==",
      neq: "!=",
      and: "&&",
      or: "||",
    };
    return map[kind] ?? kind;
  }
}

// ═══════════════════════════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════════════════════════

/**
 * 解析公式字符串为 AST
 *
 * @param src 公式源码
 * @returns AST 根节点
 * @throws 词法/语法错误
 *
 * 示例：
 *   parse("{价格} * 1.13")           → BinaryOp(*, ColumnRef("价格"), NumberLiteral(1.13))
 *   parse("LEFT({姓名}, 3)")         → FunctionCall("LEFT", [ColumnRef("姓名"), NumberLiteral(3)])
 *   parse('IF({金额} > 1000, "大", "小")') → FunctionCall("IF", [...])
 */
export function parse(src: string): ASTNode {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * 从公式 AST 中提取所有列引用名称
 *
 * 用于 AddColumnOp 在执行前验证列名是否存在。
 */
export function extractColumnRefs(node: ASTNode): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function walk(n: ASTNode): void {
    switch (n.type) {
      case "column_ref":
        if (!visited.has(n.name)) {
          visited.add(n.name);
          result.push(n.name);
        }
        break;
      case "binary_op":
        walk(n.left);
        walk(n.right);
        break;
      case "unary_op":
        walk(n.operand);
        break;
      case "function_call":
        for (const arg of n.args) walk(arg);
        break;
      default:
        break;
    }
  }

  walk(node);
  return result;
}