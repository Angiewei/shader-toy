'use strict';

import { ShaderStream } from './shaderstream';

export enum TokenType {
    Punctuation,
    Operator,
    String,
    Integer,
    Float,
    Identifier,
    PreprocessorKeyword,
    Keyword,
    Type,
    Unkown
}
export type Token = {
    type: TokenType,
    value: any
};

export type LineRange = {
    Begin: number,
    End: number
};

export class ShaderLexer {
    private stream: ShaderStream;
    private currentPeek: Token | undefined;

    private currentPeekRange: LineRange;
    private currentRange: LineRange;

    constructor(stream: ShaderStream) {
        this.stream = stream;
        this.currentPeekRange = { Begin: 0, End: 0 };
        this.currentRange = { Begin: 0, End: 0 };
    }
    
    public reset(content: string, position: number) {
        this.stream.reset(content, position);
        this.currentPeek = undefined;
    }

    public eof() {
        return this.stream.eof();
    }
    public getCurrentLine() {
        return this.stream.getCurrentLine();
    }

    public peek(): Token | undefined {
        if (this.currentPeek === undefined) {
            this.currentPeek = this.read_next();
            this.currentPeekRange.End = this.stream.pos();
        }
        return this.currentPeek;
    }
    public next(): Token | undefined {
        let token = this.peek();
        this.currentPeek = undefined;
        this.currentRange.Begin = this.currentPeekRange.Begin;
        this.currentRange.End = this.currentPeekRange.End;
        return token;
    }

    public getLastRange(): LineRange {
        return this.currentRange;
    }

    private static preprocessor_keywords = [
        'include',
        'iKeyboard',
        'iUniform'
    ];
    private is_preprocessor_keyword(val: string) {
        let idx = ShaderLexer.preprocessor_keywords.indexOf(val);
        if (idx >= 0) {
            return true;
        }
        return val.indexOf('iChannel') === 0;
    }
    private static keywords = [
        'MinFilter',
        'MagFilter',
        'WrapMode',
        'Type',
        'in'
    ];
    private is_keyword(val: string) {
        return ShaderLexer.keywords.indexOf(val) >= 0;
    }
    private static types = [
        'float',
        'vec2',
        'vec3',
        'vec4',
        'int',
        'ivec2',
        'ivec3',
        'ivec4'
    ];
    private static is_type(val: string) {
        return ShaderLexer.types.indexOf(val) >= 0;
    }
    private static is_quotation(val: string) {
        return "'\"".indexOf(val) >= 0;
    }
    private static is_digit(val: string) {
        return /[0-9]/i.test(val);
    }
    private static is_preprocessor_start(val: string) {
        return val === "#";
    }
    private static is_identifier_start(val: string) {
        return /[a-z_]/i.test(val);
    }
    private static is_identifier(val: string) {
        return ShaderLexer.is_identifier_start(val) || /[0-9]/i.test(val) || "_".indexOf(val) >= 0;
    }
    private static is_operator(val: string) {
        return "=*/+-%~&|<>?!^".indexOf(val) >= 0;
    }
    private static is_punctuation(val: string) {
        return ".,:;()[]{}".indexOf(val) >= 0;
    }
    private static is_whitespace(val: string) {
        return " \t\r\n\\".indexOf(val) >= 0;
    }
    private static is_endline(val: string) {
        return "\n".indexOf(val) >= 0;
    }
    private static not(predicate: (_: string) => boolean) {
        return (val: string) => {
            return !predicate(val);
        };
    }

    private read_next(): Token | undefined {
        if (this.stream.eof()) {
            return undefined;
        }

        if (this.currentPeek !== undefined) {
            return this.currentPeek;
        }
        
        // Skip whitespace
        this.next_while(ShaderLexer.is_whitespace);

        // Skip comments
        if (this.stream.peek() === '/') {
            if (this.stream.peek(1) === '/') {
                this.next_while(ShaderLexer.not(ShaderLexer.is_endline));
                this.stream.next();
            }
            else if (this.stream.peek(1) === '*') {
                this.stream.next();
                this.stream.next();
                do {
                    this.next_while((val: string) => val !== '*');
                    this.stream.next();
                } while (this.stream.next() !== '/');
            }
        }

        this.currentPeekRange.Begin = this.stream.pos();

        let next_peek = this.stream.peek();
        if (ShaderLexer.is_quotation(next_peek)) {
            return this.next_string(next_peek);
        }
        if (ShaderLexer.is_digit(next_peek)) {
            return this.next_number();
        }
        if (ShaderLexer.is_identifier_start(next_peek)) {
            return this.next_identifier();
        }
        if (ShaderLexer.is_preprocessor_start(next_peek)) {
            this.stream.next();
            let identifier = this.next_identifier();
            if (identifier !== undefined && this.is_preprocessor_keyword(identifier.value)) {
                identifier.type = TokenType.PreprocessorKeyword;
                return identifier;
            }
            return undefined;
        }
        if (ShaderLexer.is_punctuation(next_peek)) {
            if (next_peek === ':' && this.stream.peek(1) === ':') {
                this.stream.next();
                this.stream.next();
                return {
                    type: TokenType.Punctuation,
                    value: '::'
                };
            }

            return {
                type: TokenType.Punctuation,
                value: this.stream.next()
            };
        }
        if (ShaderLexer.is_operator(next_peek)) {
            return {
                type: TokenType.Operator,
                value: this.stream.next()
            };
        }

        return {
            type: TokenType.Unkown,
            value: this.stream.next()
        };
    }

    private next_while(predicate: (_: string) => boolean) {
        let str = '';
        while (!this.stream.eof() && predicate(this.stream.peek())) {
            str += this.stream.next();
        }
        return str;
    }
    private next_number(): Token {
        let has_dot = false;
        let number = this.next_while((val: string) => {
            if (val === ".") {
                if (has_dot) {
                    return false;
                }
                has_dot = true;
                return true;
            }
            return ShaderLexer.is_digit(val);
        });
        return {
            type: has_dot ? TokenType.Float : TokenType.Integer,
            value: parseFloat(number)
        };
    }
    private next_identifier(): Token {
        let id = this.next_while(ShaderLexer.is_identifier);
        let type = TokenType.Identifier;
        if (this.is_keyword(id)) {
            type = TokenType.Keyword;
        }
        else if (ShaderLexer.is_type(id)) {
            type = TokenType.Type;
        }
        return {
            type: type,
            value: id
        };
    }
    private next_string(quotation: string): Token {
        let escaped = false;
        let str = '';
        this.stream.next();
        while (!this.stream.eof()) {
            let val = this.stream.next();
            if (escaped) {
                str += val;
                escaped = false;
            }
            else if (val === '\\') {
                escaped = true;
            }
            else if (val === quotation) {
                break;
            }
            else {
                str += val;
            }
        }
        return {
            type: TokenType.String,
            value: str
        };
    }
}
