export type TokenType = 'color' | 'radius' | 'spacing' | 'container' | 'breakpoint' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'
export type DesignToken = {
  [T in TokenType]: Readonly<{ id: string; name: string; type: T; value: T extends 'color' | 'fontFamily' ? string : number }>
}[TokenType]
export type TokenInput = DesignToken extends infer T ? T extends DesignToken ? Omit<T, 'id'> & { readonly id?: string } : never : never
export type TokenProperty = 'fill' | 'stroke' | 'cornerRadius' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'x' | 'y' | 'width' | 'height'
export type TokenBindings = Readonly<Partial<Record<TokenProperty, string>>>
