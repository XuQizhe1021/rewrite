import type { SummaryStyle, TaskMode } from './types'

export function buildPrompts(args: {
  mode: TaskMode
  style: SummaryStyle
  title: string
  content: string
}): { system: string; user: string } {
  const styleHint =
    args.style === 'minimal'
      ? '输出尽量短，避免赘述。'
      : args.style === 'detailed'
        ? '输出可以更详细，但仍要删除冗余背景和SEO废话。'
        : '输出简洁直接。'

  if (args.mode === 'steps') {
    return {
      system:
        '用户提供的是教程或技术文档。请提取出清晰的操作步骤与注意事项，忽略无关介绍与营销内容。' +
        styleHint,
      user: `${args.content}\n\n输出格式：\n- 前置条件：\n- 步骤1：\n- 步骤2：\n...\n`,
    }
  }

  if (args.mode === 'compare') {
    return {
      system:
        '请提取文章中提到的产品/方案的优缺点对比，用表格形式呈现。忽略无关介绍与SEO堆词。' +
        styleHint,
      user: `${args.content}\n\n输出：\n| 维度 | 产品A | 产品B |\n|------|-------|-------|\n| 优点 | ...   | ...   |\n| 缺点 | ...   | ...   |\n| 价格 | ...   | ...   |\n`,
    }
  }

  return {
    system:
      '你是一个专业的阅读助手。用户会提供一篇网页正文，请忽略所有客套话、广告语、SEO废话和冗余背景介绍，直接提取核心内容。' +
      styleHint,
    user:
      `[页面标题]：${args.title}\n\n[正文]\n${args.content}\n\n请按照以下格式输出：\n1. 一句话总结（不超过30字）\n2. 核心要点（3-5条，每条一句话）\n3. 关键数据/数字（如有）\n4. 结论或行动建议（如有）\n`,
  }
}

