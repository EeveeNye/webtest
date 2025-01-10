from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

# 设置模型参数
model_path = "deepseek-ai/deepseek-coder-33b-instruct"

# 初始化模型和分词器
tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    model_path,
    torch_dtype=torch.float16,
    device_map="auto",
    trust_remote_code=True
)

def generate_code(prompt: str) -> str:
    # 构建完整的提示词
    full_prompt = f"助手：我会帮你解决编程问题。\n\n用户：{prompt}\n\n助手："
    
    # 生成回答
    inputs = tokenizer(full_prompt, return_tensors="pt").to(model.device)
    outputs = model.generate(
        **inputs,
        max_new_tokens=2048,
        temperature=0.7,
        top_p=0.95,
        pad_token_id=tokenizer.eos_token_id
    )
    return tokenizer.decode(outputs[0], skip_special_tokens=True)[len(full_prompt):]

# 测试代码
if __name__ == "__main__":
    test_prompt = "请写一个计算斐波那契数列的Python函数。"
    result = generate_code(test_prompt)
    print(result) 