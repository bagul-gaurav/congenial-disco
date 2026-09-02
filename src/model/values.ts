/**
 * Reading leaf values.
 *
 * A value is a literal, a prop reference, or a token reference. Everything that
 * needs an actual number or string goes through here, so the three cases are
 * handled once rather than at every call site.
 */

import {
  isBinding,
  isTokenRef,
  type Bindable,
  type ComponentDoc,
  type PropId,
  type PropValue,
  type Token,
  type TokenId,
  type TokenType,
} from "./types"

/** The token a reference points at, if it still exists. */
export function tokenById(tokens: Token[], id: TokenId): Token | undefined {
  return tokens.find((token) => token.id === id)
}

/**
 * The literal inside a value, or `fallback` when it is a reference.
 *
 * For editor inputs, which show a number or a colour and cannot show an
 * expression. A field driven by a prop or a token renders its own control
 * instead, so the fallback is only reached transiently.
 */
export function literalOf<T extends string | number>(value: Bindable<T> | undefined, fallback: T): T {
  if (value === undefined || isBinding(value) || isTokenRef(value)) return fallback
  return value
}

export interface ResolveContext {
  tokens: Token[]
  /** Current prop values, for previewing. */
  props?: Record<PropId, PropValue>
}

/**
 * The value as it would actually render: tokens looked up, props substituted.
 *
 * A reference that no longer resolves — a deleted token, an unset prop — falls
 * back rather than rendering `undefined` into the DOM.
 */
export function resolveValue<T extends string | number>(
  value: Bindable<T> | undefined,
  ctx: ResolveContext,
  fallback: T,
): T {
  if (value === undefined) return fallback

  if (isTokenRef(value)) {
    const token = tokenById(ctx.tokens, value.token)
    return (token?.value as T | undefined) ?? fallback
  }

  if (isBinding(value)) {
    const bound = ctx.props?.[value.bind]
    return bound === null || bound === undefined ? fallback : (bound as T)
  }

  return value
}

/** Tokens of a given type, for a picker that should only offer valid choices. */
export function tokensOfType(doc: ComponentDoc, type: TokenType): Token[] {
  return doc.tokens.filter((token) => token.type === type)
}

/** Whether a value currently reads from the given token. */
export function usesToken(value: unknown, id: TokenId): boolean {
  return isTokenRef(value) && value.token === id
}
