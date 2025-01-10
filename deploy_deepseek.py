from sglang import set_default_backend, SystemMessage, gen
from sglang.backend.vllm import VLLMEngine

# 设置模型参数
model_path = "deepseek-ai/deepseek-coder-33b-instruct"
backend_options = {
    "model": model_path,
    "tensor_parallel_size": 2,  # 根据你的GPU数量调整
    "max_num_batched_tokens": 4096,
    "trust_remote_code": True
}

# 初始化VLLMEngine后端
engine = VLLMEngine(**backend_options)
set_default_backend(engine)

# DeepSeek Coder的系统提示词
system_message = SystemMessage("""我是一个 AI 编程助手，我可以帮你解决编程相关的问题。""")

def generate_code(prompt: str) -> str:
    # 构建完整的提示词
    full_prompt = f"助手：我会帮你解决编程问题。\n\n用户：{prompt}\n\n助手："
    
    # 生成回答
    response = gen(full_prompt, max_tokens=2048)
    return response.text

# 测试代码
if __name__ == "__main__":
    test_prompt = "请写一个计算斐波那契数列的Python函数。"
    result = generate_code(test_prompt)
    print(result) 