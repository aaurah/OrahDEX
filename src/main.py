import argparse
import asyncio
from pathlib import Path
from typing import Optional

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from anthropic import Anthropic

from database import add_evaluation_result
from scripts.evaluation import parse_evaluation_file, evaluate_question


async def run_evaluation(
    mcp_server_url: str, 
    evaluation_file: Path, 
    anthropic_api_key: str,
    session: Optional[ClientSession] = None
):
    if session is None:
        async with streamablehttp_client(mcp_server_url) as session:
            return await run_evaluation(mcp_server_url, evaluation_file, anthropic_api_key, session)

    questions = parse_evaluation_file(evaluation_file)
    client = Anthropic(api_key=anthropic_api_key)

    results = []

    for i, question_data in enumerate(questions, start=1):
        print(f"Evaluating question {i}/{len(questions)}")
        question = question_data["question"]
        expected_answer = question_data["answer"]
        try:
            response = await evaluate_question(client, session, question)
        except Exception as e:
            print(f"Error during evaluation of question {i}: {e}")
            response = "<response>NOT_FOUND</response>"

        result_entry = {
            "question_id": i,
            "question": question,
            "expected_answer": expected_answer,
            "response": response,
        }
        add_evaluation_result(result_entry)
        results.append(result_entry)

    return results


def main():
    parser = argparse.ArgumentParser(description="MCP Server Evaluation Harness")
    parser.add_argument("--mcp-server-url", required=True, help="URL of the MCP server to evaluate")
    parser.add_argument("--evaluation-file", required=True, type=Path, help="Path to XML file with evaluation questions and answers")
    parser.add_argument("--anthropic-api-key", required=True, help="API key for Anthropic Claude")
    args = parser.parse_args()

    asyncio.run(run_evaluation(args.mcp_server_url, args.evaluation_file, args.anthropic_api_key))


if __name__ == "__main__":
    main()
