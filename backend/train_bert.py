import os
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
# This script demonstrates how to fine-tune a BERT-variant (like DistilBERT)
# for Named Entity Recognition (NER) to extract fields like Employee Name,
# Emp ID, and Working Days from raw unstructured timesheet text.
# -------------------------------------------------------------------------

MODEL_NAME = "distilbert-base-uncased"
OUTPUT_DIR = "./local_bert_timesheet_model"

# Example synthetic data mimicking your Timesheet dataset
# In a real scenario, you'd load your labeled dataset from a JSON/CSV file.
# Labels: 
# 0 = O (Outside)
# 1 = B-EMP_NAME
# 2 = I-EMP_NAME
# 3 = B-EMP_ID
# 4 = B-DAYS
# 5 = I-DAYS

train_data = [
    {
        "tokens": ["Please", "process", "payroll", "for", "Carlos", "Smith", "EMP10012", "for", "24", "working", "days", "."],
        "ner_tags": [0, 0, 0, 0, 1, 2, 3, 0, 4, 5, 5, 0]
    },
    {
        "tokens": ["Timesheet", "for", "Aisha", "Al", "Zaabi", ".", "She", "worked", "22", "days", ",", "id", "is", "EMP10058", "."],
        "ner_tags": [0, 0, 1, 2, 2, 0, 0, 0, 4, 5, 0, 0, 0, 3, 0]
    }
]

def main():
    print(f"Loading Tokenizer for {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # 1. Prepare Dataset
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
                    label_ids.append(label[word_idx]) # Or -100 to only label first subword
                previous_word_idx = word_idx
            labels.append(label_ids)
            
        tokenized_inputs["labels"] = labels
        return tokenized_inputs

    print("Tokenizing dataset...")
    tokenized_dataset = dataset.map(tokenize_and_align_labels, batched=True)

    # 2. Load Model
    print(f"Loading Model {MODEL_NAME} for Token Classification...")
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME, 
        num_labels=6
    )

    # 3. Setup Trainer
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        learning_rate=2e-5,
        per_device_train_batch_size=4,
        num_train_epochs=3,
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

    # 4. Train
    print("Starting training of the agentic BERT model...")
    trainer.train()
    
    # 5. Save locally
    print(f"Saving trained model to {OUTPUT_DIR}...")
    trainer.save_model(OUTPUT_DIR)
    print("Training complete! This model can now be loaded locally for timesheet extraction without external APIs.")

if __name__ == "__main__":
    main()
