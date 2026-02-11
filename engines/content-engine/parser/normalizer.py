"""
Stage 3: Block cleanup, merging, and validation.

Operates on the raw block list produced by docx_parser and prepares it
for rendering. Seven operations, applied in order (Section 5 of spec).
"""

from .docx_parser import BlockType, ContentBlock


def normalize(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """Apply all normalization operations in sequence."""
    blocks = _strip_empty(blocks)
    blocks = _merge_consecutive_bullets(blocks)
    blocks = _attach_orphan_callouts(blocks)
    blocks = _skip_toc_section(blocks)
    blocks = _validate_title(blocks)
    blocks = _validate_doc_type(blocks)
    blocks = _deduplicate_headings(blocks)
    return blocks


# ── Operation 1: Strip empty blocks ──

def _strip_empty(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """Remove blocks with empty or whitespace-only content."""
    result = []
    for b in blocks:
        if b.block_type == BlockType.BULLET_LIST:
            # Filter empty items within a bullet list
            items = [item for item in b.content if item.strip()]
            if items:
                result.append(ContentBlock(
                    block_type=b.block_type,
                    content=items,
                    level=b.level,
                    metadata=b.metadata,
                ))
        elif b.block_type == BlockType.TABLE:
            if b.content:
                result.append(b)
        elif isinstance(b.content, str) and b.content.strip():
            result.append(b)
        elif b.content:
            result.append(b)
    return result


# ── Operation 2: Merge consecutive bullet lists ──

def _merge_consecutive_bullets(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """If two adjacent BULLET_LIST blocks exist, merge into one."""
    result: list[ContentBlock] = []
    for b in blocks:
        if (b.block_type == BlockType.BULLET_LIST
                and result
                and result[-1].block_type == BlockType.BULLET_LIST):
            result[-1].content.extend(b.content)
        else:
            result.append(b)
    return result


# ── Operation 3: Attach orphan callouts ──

def _attach_orphan_callouts(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """
    If a CALLOUT block is followed by 1-2 short paragraphs,
    absorb them into the callout content.
    """
    result: list[ContentBlock] = []
    skip_indices: set[int] = set()

    for i, b in enumerate(blocks):
        if i in skip_indices:
            continue

        if b.block_type == BlockType.CALLOUT:
            callout_text = b.content
            # Check next 1-2 paragraphs
            for j in range(1, 3):
                if i + j < len(blocks):
                    nxt = blocks[i + j]
                    if (nxt.block_type == BlockType.PARAGRAPH
                            and isinstance(nxt.content, str)
                            and len(nxt.content) < 120):
                        callout_text += "\n" + nxt.content
                        skip_indices.add(i + j)
                    else:
                        break
                else:
                    break
            result.append(ContentBlock(
                block_type=BlockType.CALLOUT,
                content=callout_text,
                level=b.level,
                metadata=b.metadata,
            ))
        else:
            result.append(b)

    return result


# ── Operation 4: Skip TOC section ──

def _skip_toc_section(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """
    If a heading or doc_type says 'תוכן עניינים', remove it and
    subsequent list items until next heading.
    """
    result: list[ContentBlock] = []
    in_toc = False

    for b in blocks:
        text = b.content if isinstance(b.content, str) else ""

        if "תוכן עניינים" in text:
            in_toc = True
            continue

        if in_toc:
            if b.block_type in (BlockType.HEADING, BlockType.TITLE, BlockType.DOC_TYPE):
                in_toc = False
                result.append(b)
            # Skip bullets/paragraphs that are TOC items
            continue

        result.append(b)

    return result


# ── Operation 5: Validate title presence ──

def _validate_title(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """If no TITLE block exists, promote the first HEADING to TITLE."""
    has_title = any(b.block_type == BlockType.TITLE for b in blocks)
    if has_title:
        return blocks

    for i, b in enumerate(blocks):
        if b.block_type == BlockType.HEADING:
            blocks[i] = ContentBlock(
                block_type=BlockType.TITLE,
                content=b.content,
                level=b.level,
                metadata=b.metadata,
            )
            break

    return blocks


# ── Operation 6: Validate doc_type ──

def _validate_doc_type(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """If no DOC_TYPE block exists, add an empty one at the start."""
    has_doc_type = any(b.block_type == BlockType.DOC_TYPE for b in blocks)
    if not has_doc_type:
        blocks.insert(0, ContentBlock(
            block_type=BlockType.DOC_TYPE,
            content="",
        ))
    return blocks


# ── Operation 7: Deduplicate headings ──

def _deduplicate_headings(blocks: list[ContentBlock]) -> list[ContentBlock]:
    """If the same heading text appears consecutively, keep only one."""
    result: list[ContentBlock] = []
    for b in blocks:
        if (b.block_type == BlockType.HEADING
                and result
                and result[-1].block_type == BlockType.HEADING
                and result[-1].content == b.content):
            continue
        result.append(b)
    return result
