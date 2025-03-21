'use client';

import { useState, useRef, useEffect } from 'react';

interface Paragraph {
  id: string;
  content: string;
  originalContent: string;
  corrections?: Correction[];
  aiResponse?: string;
  diffText?: string;
  showThinking?: boolean;
  mergedIndex?: number; // 用于标识合并后的段落组
}

interface Correction {
  paragraphId: string;
  from: string;
  to: string;
  reason: string;
  confidence: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export default function DocumentReview() {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reviewingParagraph, setReviewingParagraph] = useState<string | null>(null);
  const [isAutoReviewing, setIsAutoReviewing] = useState(false);
  const autoReviewingRef = useRef(false);
  const [selectedParagraph, setSelectedParagraph] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const thoughtsContainerRef = useRef<HTMLDivElement>(null);
  const [thoughtHistory, setThoughtHistory] = useState<Array<{
    id: string;
    paragraphId: string;
    paragraphNumber: number;
    content: string;
    isRetry?: boolean;
  }>>([]);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('qwq');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [maxCharsPerMerge, setMaxCharsPerMerge] = useState<number>(1000);
  const [mergedMode, setMergedMode] = useState<boolean>(false);
  const [mergedParagraphs, setMergedParagraphs] = useState<Paragraph[]>([]);
  const [isMerged, setIsMerged] = useState(false);

  // 获取模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setModels(data.models || []);
        // 如果有模型列表且当前选择的模型不在列表中，选择第一个模型
        if (data.models?.length > 0 && !data.models.find((m: OllamaModel) => m.name === selectedModel)) {
          setSelectedModel(data.models[0].name);
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        // 设置一个空数组作为后备，确保界面不会崩溃
        setModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, [selectedModel]);

  // 监听滚动事件
  useEffect(() => {
    const container = thoughtsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
      setAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && thoughtsContainerRef.current) {
      thoughtsContainerRef.current.scrollTop = thoughtsContainerRef.current.scrollHeight;
    }
  }, [thoughtHistory, autoScroll]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      // 动态导入 mammoth
      const mammoth = (await import('mammoth')).default;
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      
      // 将文本分割成段落，保持原有的换行格式，并添加段落标记
      const paragraphArray = text.split('\n\n')
        .map((content, index) => {
          const id = `p${index + 1}`;
          return {
            id,
            content: `[${id}]${content}`,
            originalContent: content,
          };
        })
        .filter(p => p.originalContent.trim());

      setParagraphs(paragraphArray);
    } catch (error) {
      console.error('Error processing document:', error);
      alert('文档处理出错，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const extractLastJson = (text: string) => {
    try {
      // 首先尝试找到所有完整的 JSON 对象
      const jsonRegex = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
      const matches = text.match(jsonRegex);
      
      if (!matches) return null;

      // 遍历所有匹配项，尝试解析每一个，返回最后一个有效的 JSON
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const jsonStr = matches[i];
          const parsed = JSON.parse(jsonStr);
          // 确保解析出的对象具有 corrections 字段且是数组
          if (parsed && Array.isArray(parsed.corrections)) {
            // 过滤掉无效的修改建议和 from 与 to 相同的建议（模型幻觉）
            parsed.corrections = parsed.corrections.filter((correction: any) => 
              correction &&
              typeof correction === 'object' &&
              correction.from &&
              correction.to &&
              correction.from.trim() !== '' &&
              correction.to.trim() !== '' &&
              correction.from.trim() !== correction.to.trim() && // 过滤掉 from 和 to 相同的情况
              correction.reason &&
              typeof correction.confidence === 'number' &&
              correction.confidence >= 0 &&
              correction.confidence <= 1
            );
            return parsed;
          }
        } catch (e) {
          continue; // 如果解析失败，继续尝试前一个匹配项
        }
      }
      return null;
    } catch (e) {
      console.error('Error in extractLastJson:', e);
      return null;
    }
  };

  const applyCorrections = (text: string, corrections: Correction[]) => {
    // 从原始文本中提取段落ID
    const currentParagraphId = text.match(/\[p\d+\]/)?.[0]?.replace(/[\[\]]/g, '');
    
    // 过滤掉无效的修改（空字符串或找不到匹配的文本）
    const validCorrections = corrections.filter((correction: Correction) => {
      const textWithoutId = text.replace(/\[p\d+\]/g, '');
      return correction.from && 
             correction.to && 
             correction.from.trim() !== '' && 
             correction.to.trim() !== '' &&
             textWithoutId.includes(correction.from) &&  // 使用去掉标记后的文本检查
             correction.paragraphId === currentParagraphId;  // 确保是当前段落的修改
    });
    
    // 按照 from 字符串长度从大到小排序，避免替换时的干扰
    const sortedCorrections = [...validCorrections].sort((a, b) => b.from.length - a.from.length);
    
    // 保留原始文本（包含ID）用于最终显示
    let result = text;
    
    for (const correction of sortedCorrections) {
      const { from, to } = correction;
      let position = 0;
      const textWithoutId = result.replace(/\[p\d+\]/g, '');
      
      while ((position = textWithoutId.indexOf(from, position)) !== -1) {
        // 计算最长公共前缀
        let prefixLength = 0;
        while (prefixLength < from.length && prefixLength < to.length && 
               from[prefixLength] === to[prefixLength]) {
          prefixLength++;
        }

        // 计算最长公共后缀
        let suffixLength = 0;
        while (suffixLength < from.length - prefixLength && 
               suffixLength < to.length - prefixLength && 
               from[from.length - 1 - suffixLength] === to[to.length - 1 - suffixLength]) {
          suffixLength++;
        }

        // 提取需要标记的部分
        const commonPrefix = from.slice(0, prefixLength);
        const commonSuffix = from.slice(from.length - suffixLength);
        const diffFrom = from.slice(prefixLength, from.length - suffixLength);
        const diffTo = to.slice(prefixLength, to.length - suffixLength);

        // 只有当有差异时才进行替换
        if (diffFrom || diffTo) {
          // 计算实际的替换位置（需要考虑段落ID的长度）
          const idMatch = result.match(/\[p\d+\]/);
          const idLength = idMatch ? idMatch[0].length : 0;
          const actualPosition = position + idLength;

          const before = result.slice(0, actualPosition);
          const after = result.slice(actualPosition + from.length);

          // 只对真正不同的部分应用样式
          result = before + 
                  commonPrefix +
                  (diffFrom ? `<span class="line-through text-red-500">${diffFrom}</span>` : '') +
                  (diffTo ? `<span class="text-emerald-700">${diffTo}</span>` : '') +
                  commonSuffix +
                  after;

          position += commonPrefix.length + 
                    (diffFrom ? `<span class="line-through text-red-500">${diffFrom}</span>`.length : 0) +
                    (diffTo ? `<span class="text-emerald-700">${diffTo}</span>`.length : 0) +
                    commonSuffix.length;
        } else {
          position += from.length;
        }
      }
    }

    // 返回结果时不移除段落ID标记
    return result;
  };

  // 添加滚动到当前段落的函数
  const scrollToParagraph = (paragraphId: string) => {
    const element = document.getElementById(paragraphId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 合并段落函数
  const mergeParagraphs = (paragraphs: Paragraph[]): Paragraph[] => {
    const MIN_PARAGRAPH_LENGTH = 20; // 最小段落长度
    const reversedParagraphs = [...paragraphs].reverse(); // 从后往前处理
    const merged: Paragraph[] = [];
    let currentGroup: Paragraph[] = [];
    let currentLength = 0;
    let mergedIndex = 0;

    for (let i = 0; i < reversedParagraphs.length; i++) {
      const paragraph = reversedParagraphs[i];
      const paragraphLength = paragraph.originalContent.trim().length;
      
      // 如果当前段落小于最小长度且不是第一段
      if (paragraphLength < MIN_PARAGRAPH_LENGTH && i < reversedParagraphs.length - 1) {
        // 直接添加到当前组，不考虑长度限制
        currentGroup.unshift(paragraph);
        currentLength += paragraphLength;
        continue;
      }

      // 正常的长度检查和合并逻辑
      if (currentLength + paragraphLength > maxCharsPerMerge && currentGroup.length > 0) {
        // 当前组达到上限，创建新的合并段落
        merged.unshift({
          id: `merged-${mergedIndex}`,
          content: currentGroup.map(p => p.content).join('\n\n'),
          originalContent: currentGroup.map(p => p.originalContent).join('\n\n'),
          mergedIndex
        });
        currentGroup = [paragraph];
        currentLength = paragraphLength;
        mergedIndex++;
      } else {
        currentGroup.unshift(paragraph);
        currentLength += paragraphLength;
      }
    }

    // 处理最后一组（实际上是第一组）
    if (currentGroup.length > 0) {
      merged.unshift({
        id: `merged-${mergedIndex}`,
        content: currentGroup.map(p => p.content).join('\n\n'),
        originalContent: currentGroup.map(p => p.originalContent).join('\n\n'),
        mergedIndex
      });
    }

    return merged;
  };

  // 修改合并段落函数
  const handleMerge = () => {
    const merged = mergeParagraphs(paragraphs);
    setMergedParagraphs(merged);
    setIsMerged(true);
  };

  // 取消合并
  const handleUnmerge = () => {
    setMergedParagraphs([]);
    setIsMerged(false);
  };

  // 修改 reviewAllParagraphs 函数
  const reviewAllParagraphs = async () => {
    const paragraphsToReview = isMerged ? mergedParagraphs : paragraphs;
    
    setIsAutoReviewing(true);
    autoReviewingRef.current = true;

    try {
      for (let i = 0; i < paragraphsToReview.length; i++) {
        if (!autoReviewingRef.current) break;
        
        const paragraph = paragraphsToReview[i];
        console.log(`开始审核第 ${i + 1} ${isMerged ? '组' : '段'}`);
        await reviewParagraph(paragraph.id);
        
        if (i < paragraphsToReview.length - 1 && autoReviewingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error('Error in auto review:', error);
      alert('自动审校过程出错，请重试');
    } finally {
      setIsAutoReviewing(false);
      autoReviewingRef.current = false;
    }
  };

  // 修改 reviewParagraph 函数
  const reviewParagraph = async (paragraphId: string, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const paragraph = isMerged 
      ? mergedParagraphs.find(p => p.id === paragraphId)
      : paragraphs.find(p => p.id === paragraphId);
      
    if (!paragraph) return;

    if (isAutoReviewing && paragraph.corrections) {
      return;
    }

    setReviewingParagraph(paragraphId);
    scrollToParagraph(paragraphId);

    // 添加新的思考记录
    const thoughtId = `thought-${Date.now()}`;
    const paragraphNumber = parseInt(paragraphId.split('-')[1]) + 1;
    
    if (retryCount > 0) {
      setThoughtHistory(prev => [
        ...prev,
        {
          id: thoughtId,
          paragraphId,
          paragraphNumber,
          content: `正在进行第 ${retryCount} 次重试...`,
          isRetry: true
        }
      ]);
    } else {
      setThoughtHistory(prev => [
        ...prev,
        {
          id: thoughtId,
          paragraphId,
          paragraphNumber,
          content: ''
        }
      ]);
    }

    try {
      const prompt = `你作为一名资深编辑，审核修改下面的文本达到出版级，修复所有细节性错误、对标人民日报、人民网的文本水平。帮我纠正下面的文本中所有的错别字和语法错误，我的文本质量本身已经很高了，不要尝试优化文本，你只需要完成确定不对的错别字、语法的纠错改正、不合理的用词。

注意：
1. 文本中包含了段落ID标记，格式为[pXX]，这些标记不要修改
2. 在输出修改建议时，必须指明修改内容所在的段落ID（不包含方括号）
3. 置信度的取值为0-1
4. 如果不需要修改直接返回空数组
5. 无论是否有错误都需要输出json

输出格式：
{
  "corrections": [
    {
      "paragraphId": "p1",  // 段落ID，不包含方括号
      "from": "错误词/短语",
      "reason": "错误原因：错别字/语法错误/用词不当/知识点错误",
      "to": "正确词",
      "confidence": 1.00
    }
  ]
}

正文：
${paragraph.content}`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt,
          stream: true,
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let accumulatedText = '';
      
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const jsonData = JSON.parse(line);
              if (jsonData.response) {
                accumulatedText += jsonData.response;
                if (!isAutoReviewing) {
                  setThoughtHistory(prev => prev.map(t => 
                    t.id === thoughtId 
                      ? { ...t, content: accumulatedText }
                      : t
                  ));
                }
              }
            } catch (e) {
              console.error('Error parsing JSON line:', e);
            }
          }
        }
      }

      // 处理最后一个不完整的行
      if (buffer.trim()) {
        try {
          const jsonData = JSON.parse(buffer);
          if (jsonData.response) {
            accumulatedText += jsonData.response;
            if (!isAutoReviewing) {
              setThoughtHistory(prev => prev.map(t => 
                t.id === thoughtId 
                  ? { ...t, content: accumulatedText }
                  : t
              ));
            }
          }
        } catch (e) {
          console.error('Error parsing final JSON:', e);
        }
      }

      const corrections = extractLastJson(accumulatedText);
      
      if (!corrections && retryCount < MAX_RETRIES) {
        return reviewParagraph(paragraphId, retryCount + 1);
      }

      const finalCorrections = corrections || { corrections: [] };
      const diffText = applyCorrections(paragraph.content, finalCorrections.corrections);
      
      if (isMerged) {
        setMergedParagraphs(prev => prev.map(p => 
          p.id === paragraphId 
            ? { 
                ...p, 
                corrections: finalCorrections.corrections,
                diffText: diffText,
                aiResponse: accumulatedText
              }
            : p
        ));
      } else {
        setParagraphs(prev => prev.map(p => 
          p.id === paragraphId 
            ? { 
                ...p, 
                corrections: finalCorrections.corrections,
                diffText: diffText,
                aiResponse: accumulatedText
              }
            : p
        ));
      }

      if (isAutoReviewing) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error reviewing paragraph:', error);
      if (!isAutoReviewing) {
        alert('审核过程出错，请重试');
      }
    } finally {
      setReviewingParagraph(null);
    }
  };

  return (
    <div className="fixed inset-0 flex">
      {/* 左侧滚动区域 */}
      <div className="w-[calc(100%-480px)] h-full flex flex-col">
        <div className="flex-none p-4">
          <div className="flex justify-between items-center">
            <label
              htmlFor="file-upload"
              className="flex-1 block rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
            >
              <span className="mt-2 block text-base font-semibold text-gray-900">
                点击上传 Word 文档
              </span>
              <span className="mt-1 block text-sm text-gray-500">
                支持 .docx 格式
              </span>
            </label>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept=".docx"
              onChange={handleFileUpload}
              disabled={isLoading}
            />
            
            {paragraphs.length > 0 && (
              <div className="ml-4 flex items-center space-x-4">
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isLoadingModels || isAutoReviewing}
                    className="block w-48 rounded-md border-gray-300 py-2 pl-3 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isLoadingModels ? (
                      <option value="">加载中...</option>
                    ) : (
                      models.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                        </option>
                      ))
                    )}
                  </select>
                  {isLoadingModels && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <label htmlFor="maxChars" className="text-sm text-gray-700">
                    合并字数上限：
                  </label>
                  <input
                    id="maxChars"
                    type="number"
                    min="100"
                    max="2000"
                    value={maxCharsPerMerge}
                    onChange={(e) => setMaxCharsPerMerge(Math.max(100, Math.min(2000, parseInt(e.target.value) || 1200)))}
                    disabled={isAutoReviewing}
                    className="w-20 rounded-md border-gray-300 py-1 px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  {!isMerged ? (
                    <button
                      onClick={handleMerge}
                      disabled={isAutoReviewing}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      合并段落
                    </button>
                  ) : (
                    <button
                      onClick={handleUnmerge}
                      disabled={isAutoReviewing}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      取消合并
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      if (isAutoReviewing) {
                        setIsAutoReviewing(false);
                        autoReviewingRef.current = false;
                      } else {
                        reviewAllParagraphs();
                      }
                    }}
                    disabled={isLoadingModels}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      isAutoReviewing
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isAutoReviewing ? '停止审校' : `一键审校${isMerged ? '(已合并)' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">正在处理文档...</p>
            </div>
          )}
        </div>

        {/* 段落列表区域 */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {isMerged && (
            <div className="mb-4 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                已合并为 {mergedParagraphs.length} 组，每组不超过 {maxCharsPerMerge} 字
              </p>
            </div>
          )}
          <div className="space-y-6">
            {(isMerged ? mergedParagraphs : paragraphs).map((paragraph, index) => (
              <div 
                key={paragraph.id} 
                id={paragraph.id}
                onClick={() => paragraph.aiResponse && setSelectedParagraph(paragraph.id)}
                className={`border rounded-lg p-4 shadow-sm transition-all duration-300 ${
                  reviewingParagraph === paragraph.id ? 'ring-2 ring-indigo-500 ring-opacity-50' : ''
                } ${paragraph.aiResponse ? 'cursor-pointer hover:bg-gray-50' : ''} ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
              >
                {paragraph.diffText ? (
                  <div 
                    className="text-gray-800 mb-4 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: paragraph.diffText }}
                  />
                ) : (
                  <p className="text-gray-800 mb-4 whitespace-pre-wrap">
                    {paragraph.content}
                  </p>
                )}

                {paragraph.corrections && paragraph.corrections.length > 0 && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">建议修改：</h4>
                    <ul className="space-y-2">
                      {paragraph.corrections.map((correction, index) => {
                        // 计算最长公共前缀和后缀
                        let prefixLength = 0;
                        while (prefixLength < correction.from.length && 
                               prefixLength < correction.to.length && 
                               correction.from[prefixLength] === correction.to[prefixLength]) {
                          prefixLength++;
                        }

                        let suffixLength = 0;
                        while (suffixLength < correction.from.length - prefixLength && 
                               suffixLength < correction.to.length - prefixLength && 
                               correction.from[correction.from.length - 1 - suffixLength] === 
                               correction.to[correction.to.length - 1 - suffixLength]) {
                          suffixLength++;
                        }

                        // 提取需要标记的部分
                        const commonPrefix = correction.from.slice(0, prefixLength);
                        const commonSuffix = correction.from.slice(correction.from.length - suffixLength);
                        const diffFrom = correction.from.slice(prefixLength, correction.from.length - suffixLength);
                        const diffTo = correction.to.slice(prefixLength, correction.to.length - suffixLength);

                        // 只有当有差异时才显示
                        if (!diffFrom && !diffTo) return null;

                        return (
                          <li key={index} className="text-sm">
                            <div className="flex items-start space-x-2">
                              <div className="flex-1">
                                <p className="text-gray-900">
                                  {commonPrefix}
                                  <span className="line-through text-red-500">{diffFrom}</span>
                                  <span className="text-emerald-700">{diffTo}</span>
                                  {commonSuffix}
                                </p>
                                <p className="text-gray-600 text-xs mt-1">
                                  {correction.reason}
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 whitespace-nowrap">
                                置信度：{Math.round(correction.confidence * 100)}%
                              </span>
                            </div>
                          </li>
                        );
                      }).filter(Boolean)}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reviewParagraph(paragraph.id, 0);
                    }}
                    disabled={reviewingParagraph === paragraph.id || isAutoReviewing}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      reviewingParagraph === paragraph.id || isAutoReviewing
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {reviewingParagraph === paragraph.id ? '审核中...' : 'AI 审核'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧固定思考过程区域 */}
      <div className="w-[480px] h-full fixed top-0 right-0 border-l border-gray-200 bg-white flex flex-col">
        <div className="flex-none p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">AI 思考过程</h3>
        </div>
        
        <div 
          ref={thoughtsContainerRef}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {thoughtHistory.map((thought) => (
            <div 
              key={thought.id}
              className={`rounded-md p-4 ${
                thought.isRetry 
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-900">
                  第 {thought.paragraphNumber} 段
                  {thought.isRetry && (
                    <span className="ml-2 text-yellow-600">重试中...</span>
                  )}
                </p>
                {reviewingParagraph === thought.paragraphId && (
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    实时输出
                  </span>
                )}
              </div>
              <div className="font-mono text-sm whitespace-pre-wrap">
                {thought.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 