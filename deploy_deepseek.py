import sglang as sgl

# 设置模型参数
model_path = "deepseek-ai/deepseek-coder-33b-instruct"

# 初始化模型
sgl.set_default_backend("hf")  # 使用 Hugging Face 后端
llm = sgl.Runtime(model_path, trust_remote_code=True, device="cuda")

def generate_code(prompt: str) -> str:
    # 构建完整的提示词
    full_prompt = f"助手：我会帮你解决编程问题。\n\n用户：{prompt}\n\n助手："
    
    # 生成回答
    with sgl.system():
        s = sgl.UserMessage(full_prompt)
        s += sgl.AssistantMessage(stop=["用户："])
    
    result = llm.generate(s, max_tokens=2048, temperature=0.7, top_p=0.95)
    return result.text

# 测试代码
if __name__ == "__main__":
    test_prompt = "请写一个计算斐波那契数列的Python函数。"
    result = generate_code(test_prompt)
    print(result) 