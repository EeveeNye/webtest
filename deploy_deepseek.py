from vllm import LLM, SamplingParams

# 设置模型参数
model_path = "deepseek-ai/deepseek-coder-33b-instruct"

# 初始化模型
llm = LLM(
    model=model_path,
    tensor_parallel_size=2,  # 根据你的GPU数量调整
    trust_remote_code=True
)

# 设置生成参数
sampling_params = SamplingParams(
    max_tokens=2048,
    temperature=0.7,
    top_p=0.95
)

def generate_code(prompt: str) -> str:
    # 构建完整的提示词
    full_prompt = f"助手：我会帮你解决编程问题。\n\n用户：{prompt}\n\n助手："
    
    # 生成回答
    outputs = llm.generate([full_prompt], sampling_params)
    return outputs[0].outputs[0].text

# 测试代码
if __name__ == "__main__":
    test_prompt = "请写一个计算斐波那契数列的Python函数。"
    result = generate_code(test_prompt)
    print(result) 