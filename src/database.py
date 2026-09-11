from tinydb import TinyDB, Query
import os

db_path = os.path.join(os.path.dirname(__file__), '../data/evaluation_results.json')
db = TinyDB(db_path)

def add_evaluation_result(evaluation_dict):
    """
    Add or update an evaluation result in the database.
    :param evaluation_dict: dict containing at least 'question_id' key
    """
    Evaluation = Query()
    question_id = evaluation_dict.get("question_id")
    if not question_id:
        raise ValueError("Evaluation must have a 'question_id' key")

    if db.search(Evaluation.question_id == question_id):
        db.update(evaluation_dict, Evaluation.question_id == question_id)
    else:
        db.insert(evaluation_dict)

def get_all_results():
    """
    Retrieve all evaluation results.
    """
    return db.all()
