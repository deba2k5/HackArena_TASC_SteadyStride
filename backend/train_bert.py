import os
import pandas as pd
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    Trainer,
    TrainingArguments,
    DataCollatorForTokenClassification
)
from datasets import Dataset

# -------------------------------------------------------------------------
# Training Script for BERT Variants (Information Extraction from Timesheets)
# This script fine-tunes DistilBERT for Named Entity Recognition (NER) 
# by reading the real-world Timesheet_Data.xlsx dataset, dynamically 
# generating tokens and NER tags, and training the model.
# -------------------------------------------------------------------------

MODEL_NAME = "distilbert-base-uncased"
OUTPUT_DIR = "./local_bert_timesheet_model"
DATA_FILE = r"C:\Users\Debangshu05\Downloads\Timesheet_Data.xlsx"

def prepare_data():
    print(f"Loading real dataset from {DATA_FILE}...")
    try:
        # Read sheet S3 (email bodies and expected IDs)
        # header=1 because row 0 is metadata, row 1 is headers
        df = pd.read_excel(DATA_FILE, sheet_name="S3_Email_Requests_C1_C2", header=1)
    except Exception as e:
        print(f"Failed to read dataset: {e}")
        print("Falling back to synthetic data...")
        return [
            {
                "tokens": ["Please", "process", "payroll", "for", "Carlos", "Smith", "EMP10012", "for", "24", "working", "days", "."],
                "ner_tags": [0, 0, 0, 0, 1, 2, 3, 0, 4, 5, 5, 0]
            }
        ]

    # Drop empty rows
    df = df.dropna(subset=["Request Body"])
    
    train_data = []
    
    # 0 = O (Outside), 3 = B-EMP_ID
    for _, row in df.iterrows():
        text = str(row["Request Body"])
        emp_id = str(row["Expected EmpID"]) if pd.notna(row["Expected EmpID"]) else ""
        
        # Simple tokenization for NER data generation
        tokens = text.replace('\n', ' ').split()
        ner_tags = []
        
        for t in tokens:
            # If the token contains the employee ID, tag it as 3 (B-EMP_ID)
            if emp_id and emp_id in t:
                ner_tags.append(3)
            else:
                ner_tags.append(0)
                
        if tokens:
            train_data.append({
                "tokens": tokens,
                "ner_tags": ner_tags
            })
            
    print(f"Successfully generated {len(train_data)} training records from Excel.")
    return train_data

def main():
    print(f"Loading Tokenizer for {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    train_data = prepare_data()
    dataset = Dataset.from_list(train_data)
    
    def tokenize_and_align_labels(examples):
        tokenized_inputs = tokenizer(
            examples["tokens"], truncation=True, is_split_into_words=True, padding="max_length", max_length=128
        )
        
        labels = []
        for i, label in enumerate(examples["ner_tags"]):
            word_ids = tokenized_inputs.word_ids(batch_index=i)
            previous_word_idx = None
            label_ids = []
            for word_idx in word_ids:
                if word_idx is None:
                    label_ids.append(-100) # Ignore special tokens
                elif word_idx != previous_word_idx:
                    label_ids.append(label[word_idx])
                else:
                    label_ids.append(label[word_idx]) 
                previous_word_idx = word_idx
            labels.append(label_ids)
            
        tokenized_inputs["labels"] = labels
        return tokenized_inputs

    print("Tokenizing dataset...")
    tokenized_dataset = dataset.map(tokenize_and_align_labels, batched=True)

    print(f"Loading Model {MODEL_NAME} for Token Classification...")
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME, 
        num_labels=6
    )

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        learning_rate=2e-5,
        per_device_train_batch_size=4,
        num_train_epochs=3, # Increased slightly since real dataset is larger
        weight_decay=0.01,
        save_strategy="epoch",
        logging_dir='./logs',
        logging_steps=10
    )

    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
        tokenizer=tokenizer,
        data_collator=data_collator,
    )

    print("Starting training of the agentic BERT model on REAL Excel data...")
    trainer.train()
    
    print(f"Saving trained model to {OUTPUT_DIR}...")
    trainer.save_model(OUTPUT_DIR)
    print("Training complete! This model can now be loaded locally for timesheet extraction without external APIs.")

if __name__ == "__main__":
    main()
