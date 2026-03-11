import type { DocumentFormat, Renderer, RendererFactory } from './types.js'

/**
 * Registry mapping document formats to their renderer factories.
 * Built-in renderers are registered by default. Consumers can register
 * custom renderers for new formats via `DocView.registerRenderer()`.
 */
class FormatRegistry {
  private factories = new Map<DocumentFormat, RendererFactory>()

  /** Register a renderer factory for a format. Overwrites any existing registration. */
  register(format: DocumentFormat, factory: RendererFactory): void {
    this.factories.set(format, factory)
  }

  /** Create a renderer for the given format. Returns null if no renderer is registered. */
  create(format: DocumentFormat): Renderer | null {
    const factory = this.factories.get(format)
    return factory ? factory() : null
  }

  /** Check if a renderer is registered for the given format. */
  has(format: DocumentFormat): boolean {
    return this.factories.has(format)
  }

  /** Get all registered format names. */
  formats(): DocumentFormat[] {
    return [...this.factories.keys()]
  }

  /** Remove a renderer registration. */
  unregister(format: DocumentFormat): void {
    this.factories.delete(format)
  }
}

/** Singleton format registry. */
export const registry = new FormatRegistry()
