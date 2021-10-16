import React, {useMemo, useCallback, useRef, useEffect, useState} from 'react'
import isHotkey from 'is-hotkey'
import {Editor, Transforms, Range, createEditor, Text,} from 'slate'
import {withHistory} from 'slate-history'
import {
    Slate,
    Editable,
    ReactEditor,
    withReact,
    useSelected,
    useFocused,
    useSlate,
} from 'slate-react'
import {Button, Toolbar, Icon, Portal} from './components'
import {jsx} from 'slate-hyperscript'

const serialize = node => {
    if (Text.isText(node)) {
        let text=node.text;
        if (node.bold) {
            text= `<strong>${text}</strong>`
        }
        if (node.underline) {
            text= `<u>${text}</u>`
        }
        if (node.code) {
            text= `<code>${text}</code>`
        }
        if (node.italic) {
            text= `<em>${text}</em>`
        }
        return text
    }
    const children = node.children.map(n => serialize(n)).join('')

    switch (node.type) {
        case 'block-quote':
            return `<blockquote><p>${children}</p></blockquote>`
        case 'paragraph':
            return `<p>${children}</p>`
        case 'heading-one':
            return `<h1>${children}</h1>`
        case 'heading-two':
            return `<h2>${children}</h2>`
        case 'numbered-list':
            return `<ol>${children}</ol>`
        case 'bulleted-list':
            return `<ul>${children}</ul>`
        case 'list-item':
            return `<li>${children}</li>`
        case 'mention':
            return `<span style="color: darkblue">${node.character}</span>`
        default:
            return children
    }

}

const deserialize = el => {
    if (el.nodeType === 3) {
        return el.textContent
    } else if (el.nodeType !== 1) {
        return null
    }

    const children = Array.from(el.childNodes).map(deserialize)

    switch (el.nodeName) {
        case 'BODY':
            return jsx('fragment', {}, children)
        case 'BR':
            return '\n'
        case 'BLOCKQUOTE':
            return jsx('element', {type: 'quote'}, children)
        case 'P':
            return jsx('element', {type: 'paragraph'}, children)
        case 'STRONG':
            return jsx('text', {bold: true}, children)
        case 'EM':
            return jsx('text', {italic: true}, children)
        case 'U':
            return jsx('text', {underline: true}, children)
        case 'CODE':
            return jsx('text', {code: true}, children)
        case 'SPAN':
            return jsx('element', {type: 'mention', character: children.toString()}, [{text: ""}])
        case 'H1':
            return jsx('element', {type: 'heading-one'}, children)
        case 'H2':
            return jsx('element', {type: 'heading-two'}, children)
        case 'LI':
            return jsx('element', {type: 'list-item'}, children)
        case 'OL':
            return jsx('element', {type: 'numbered-list'}, children)
        case 'UL':
            return jsx('element', {type: 'bulleted-list'}, children)
        default:
            return el.textContent
    }
}

const HOTKEYS = {
    'mod+b': 'bold',
    'mod+i': 'italic',
    'mod+u': 'underline',
    'mod+`': 'code',
}

const LIST_TYPES = ['numbered-list', 'bulleted-list'];

const App = () => {
    const ref = useRef()
    const [value, setValue] = useState(initialValue)
    const [target, setTarget] = useState()
    const [index, setIndex] = useState(0)
    const [search, setSearch] = useState('')
    const renderElement = useCallback(props => <Element {...props} />, [])
    const renderLeaf = useCallback(props => <Leaf {...props} />, [])
    const editor = useMemo(
        () => withMentions(withHistory(withReact(createEditor()))),
        []
    )

    const chars = CHARACTERS.filter(c =>
        c.toLowerCase().startsWith(search.toLowerCase())
    ).slice(0, 10)

    const onKeyDown = useCallback(
        event => {

            if (target) {
                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault()
                        const prevIndex = index >= chars.length - 1 ? 0 : index + 1
                        setIndex(prevIndex)
                        break
                    case 'ArrowUp':
                        event.preventDefault()
                        const nextIndex = index <= 0 ? chars.length - 1 : index - 1
                        setIndex(nextIndex)
                        break
                    case 'Tab':
                    case 'Enter':
                        event.preventDefault()
                        Transforms.select(editor, target)
                        console.log(chars[index])
                        insertMention(editor, "{{"+chars[index]+"}}")
                        setTarget(null)
                        break
                    case 'Escape':
                        event.preventDefault()
                        setTarget(null)
                        break
                    default:
                        console.log(event.key)
                }
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [chars, editor, index, target]
    )

    useEffect(() => {
        if (target && chars.length > 0) {
            const el = ref.current
            const domRange = ReactEditor.toDOMRange(editor, target)
            const rect = domRange.getBoundingClientRect()
            el.style.top = `${rect.top + window.pageYOffset + 24}px`
            el.style.left = `${rect.left + window.pageXOffset}px`
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chars.length, editor, index, search, target])

    return (
        <div>
            <Slate
                editor={editor}
                value={value}
                onChange={value => {
                    setValue(value)
                    const {selection} = editor

                    if (selection && Range.isCollapsed(selection)) {
                        const [start] = Range.edges(selection)
                        const wordBefore = Editor.before(editor, start, {unit: 'word'})
                        const before = wordBefore && Editor.before(editor, wordBefore)
                        const beforeRange = before && Editor.range(editor, before, start)
                        const beforeText = beforeRange && Editor.string(editor, beforeRange)
                        const beforeMatch = beforeText && beforeText.match(/^{(\w+)$/)
                        const after = Editor.after(editor, start)
                        const afterRange = Editor.range(editor, start, after)
                        const afterText = Editor.string(editor, afterRange)
                        const afterMatch = afterText.match(/^(\s|$)/)

                        if (beforeMatch && afterMatch) {
                            setTarget(beforeRange)
                            setSearch(beforeMatch[1])
                            setIndex(0)
                            return
                        }
                    }

                    setTarget(null)
                }}
            >
                <Toolbar>
                    <MarkButton format="bold" icon="format_bold"/>
                    <MarkButton format="italic" icon="format_italic"/>
                    <MarkButton format="underline" icon="format_underlined"/>
                    <MarkButton format="code" icon="code"/>
                    <BlockButton format="heading-one" icon="looks_one"/>
                    <BlockButton format="heading-two" icon="looks_two"/>
                    <BlockButton format="block-quote" icon="format_quote"/>
                    <BlockButton format="numbered-list" icon="format_list_numbered"/>
                    <BlockButton format="bulleted-list" icon="format_list_bulleted"/>
                </Toolbar>
                <Editable
                    renderElement={renderElement}
                    renderLeaf={renderLeaf}
                    onKeyDown={(event) => {
                        onKeyDown(event)
                        for (const hotkey in HOTKEYS) {
                            if (isHotkey(hotkey, event)) {
                                event.preventDefault()
                                const mark = HOTKEYS[hotkey]
                                toggleMark(editor, mark)
                            }
                        }
                    }}
                    placeholder="Enter some text..."
                />
                {target && chars.length > 0 && (
                    <Portal>
                        <div
                            ref={ref}
                            style={{
                                top: '-9999px',
                                left: '-9999px',
                                position: 'absolute',
                                zIndex: 1,
                                padding: '3px',
                                background: 'white',
                                borderRadius: '4px',
                                boxShadow: '0 1px 5px rgba(0,0,0,.2)',
                            }}
                        >
                            {chars.map((char, i) => (
                                <div
                                    key={char}
                                    style={{
                                        padding: '1px 3px',
                                        borderRadius: '3px',
                                        background: i === index ? '#B4D5FF' : 'transparent',
                                    }}
                                >
                                    {char}
                                </div>
                            ))}
                        </div>
                    </Portal>
                )}
            </Slate>
            <button onClick={(event => {
                    var test = serialize(editor)
                    console.log(test)
                    console.log(deserialize(new DOMParser().parseFromString(test, 'text/html').body))
                }
            )}>Add
            </button>

        </div>
    )
}

const withMentions = editor => {
    const {isInline, isVoid} = editor
    editor.isInline = element => {
        return element.type === 'mention' ? true : isInline(element)
    }
    editor.isVoid = element => {
        return element.type === 'mention' ? true : isVoid(element)
    }

    return editor
}

const insertMention = (editor, character) => {
    const mention = {type: 'mention', character, children: [{text: ''}]}
    Transforms.insertNodes(editor, mention)
    Transforms.move(editor)
}
const toggleBlock = (editor, format) => {
    const isActive = isBlockActive(editor, format)
    const isList = LIST_TYPES.includes(format)

    Transforms.unwrapNodes(editor, {
        match: n => LIST_TYPES.includes(n.type),
        split: true,
    })

    Transforms.setNodes(editor, {
        type: isActive ? 'paragraph' : isList ? 'list-item' : format,
    })

    if (!isActive && isList) {
        const block = {type: format, children: []}
        Transforms.wrapNodes(editor, block)
    }
}

const toggleMark = (editor, format) => {
    const isActive = isMarkActive(editor, format)

    if (isActive) {
        Editor.removeMark(editor, format)
    } else {
        Editor.addMark(editor, format, true)
    }
}

const isBlockActive = (editor, format) => {
    const [match] = Editor.nodes(editor, {
        match: n => n.type === format,
    })

    return !!match
}

const isMarkActive = (editor, format) => {
    const marks = Editor.marks(editor)
    return marks ? marks[format] === true : false
}

const Element = props => {
    const {attributes, children, element} = props
    switch (element.type) {
        case 'block-quote':
            return <blockquote {...attributes}>{children}</blockquote>
        case 'bulleted-list':
            return <ul {...attributes}>{children}</ul>
        case 'heading-one':
            return <h1 {...attributes}>{children}</h1>
        case 'heading-two':
            return <h2 {...attributes}>{children}</h2>
        case 'list-item':
            return <li {...attributes}>{children}</li>
        case 'numbered-list':
            return <ol {...attributes}>{children}</ol>
        case 'mention':
            return <MentionElement {...props} />
        default:
            return <p {...attributes}>{children}</p>
    }
}
const Leaf = ({attributes, children, leaf}) => {
    if (leaf.bold) {
        children = <strong>{children}</strong>
    }

    if (leaf.code) {
        children = <code>{children}</code>
    }

    if (leaf.italic) {
        children = <em>{children}</em>
    }

    if (leaf.underline) {
        children = <u>{children}</u>
    }
    return <span {...attributes}>{children}</span>
}

const BlockButton = ({format, icon}) => {
    const editor = useSlate()
    return (
        <Button
            active={isBlockActive(editor, format)}
            onMouseDown={event => {
                event.preventDefault()
                toggleBlock(editor, format)
            }}
        >
            <Icon>{icon}</Icon>
        </Button>
    )
}

const MarkButton = ({format, icon}) => {
    const editor = useSlate()
    return (
        <Button
            active={isMarkActive(editor, format)}
            onMouseDown={event => {
                event.preventDefault()
                toggleMark(editor, format)
            }}
        >
            <Icon>{icon}</Icon>
        </Button>
    )
}
const MentionElement = ({attributes, children, element}) => {
    const selected = useSelected()
    const focused = useFocused()
    return (
        <span
            {...attributes}
            contentEditable={false}
            style={{
                padding: '3px 3px 2px',
                margin: '0 1px',
                color:'darkblue',
                verticalAlign: 'baseline',
                display: 'inline-block',
                borderRadius: '4px',
                backgroundColor: '#eee',
                fontSize: '0.9em',
                boxShadow: selected && focused ? '0 0 0 2px #B4D5FF' : 'none',
            }}
        >
      {element.character}
            {children}
    </span>
    )
}

const initialValue = [
    {
        type: 'paragraph',
        children: [
            {text: ''},
        ],
    },

]

const CHARACTERS = ['Ayushi', 'Sarang']

export default App