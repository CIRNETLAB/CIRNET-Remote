import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, type Component } from 'vue'
import type { Pinia } from 'pinia'

export async function loadSfc(path: string): Promise<Component> {
  const outfile = resolve('.test-build', path.replace(/[/\\.]/g, '-') + '.runtime.mjs')
  await build({ entryPoints: [resolve('src', path)], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.svg': 'dataurl' }, plugins: [{
    name: 'runtime-sfc', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
        const { descriptor } = parse(await readFile(path, 'utf8'), { filename: path })
        const script = compileScript(descriptor, { id: path, inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } })
        return { contents: script.content, loader: 'ts', resolveDir: dirname(path) }
      })
    },
  }] })
  return (await import(pathToFileURL(outfile).href)).default
}

export interface HostNode { tag: string; text: string; props: Record<string, unknown>; children: HostNode[]; parent: HostNode | null }
// Minimal DOM boundary for pre-existing disabled v-model directives. App events
// are still invoked from the compiled component's production event props.
const node = (tag: string, text = ''): HostNode => ({ tag, text, props: {}, children: [], parent: null, tagName: tag.toUpperCase(), options: [], addEventListener() {}, removeEventListener() {} } as HostNode)
export function mountSfc(component: Component, pinia: Pinia, props: Record<string, unknown> | null = null) {
  const renderer = createRenderer<HostNode, HostNode>({
    createElement: (tag) => node(tag), createText: (text) => node('#text', text), createComment: (text) => node('#comment', text),
    setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text; node.children = [] },
    parentNode: (node) => node.parent, nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    patchProp: (node, key, _old, value) => { node.props[key] = value },
    insert(child, parent, anchor) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    },
    remove(node) { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = null },
  })
  const root = node('root'), app = renderer.createApp(component, props).use(pinia)
  app.mount(root)
  const all = (parent = root): HostNode[] => parent.children.flatMap(child => [child, ...all(child)])
  return { app, all, text: () => all().map(node => node.text).join(' '), find: (tag: string, key: string, value: unknown) => all().find(node => node.tag === tag && node.props[key] === value)! }
}
export function dispatch(node: HostNode, event: string, value?: unknown) {
  const handler = node.props[event] as (event: unknown) => void
  handler({ target: { value, checked: value } })
}
