import os
import json
import uuid
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://sinhasapp:sinhasapp123@sinhasapp.mhknlyr.mongodb.net/?appName=sinhasapp",
)
MONGODB_DB = os.getenv("MONGODB_DB", "sinhasapp")

# In-memory and file-based fallback database representation
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

class JSONCollectionFallback:
    def __init__(self, name):
        self.name = name
        self.file_path = os.path.join(DATA_DIR, f"{name}.json")
        self._ensure_file()

    def _ensure_file(self):
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w") as f:
                json.dump([], f)

    def _read(self):
        try:
            with open(self.file_path, "r") as f:
                return json.load(f)
        except Exception:
            return []

    def _write(self, data):
        with open(self.file_path, "w") as f:
            json.dump(data, f, indent=2, default=str)

    def _match(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                # Handle simple $or query (e.g. [{"id": val}, {"_id": val}])
                match_any = False
                for sub_query in v:
                    if self._match(doc, sub_query):
                        match_any = True
                        break
                if not match_any:
                    return False
            elif k.startswith("$"):
                # Ignore advanced operators for simple fallback
                continue
            else:
                # Direct match
                doc_val = doc.get(k)
                if isinstance(v, dict):
                    # Handle basic nested operators like $setOnInsert (handled during insert)
                    continue
                # Match ObjectId or String
                if str(doc_val) != str(v):
                    return False
        return True

    def find(self, query=None, sort=None, limit=None):
        docs = self._read()
        filtered = [d for d in docs if self._match(d, query)]
        
        # Simple sorting helper
        if sort:
            for field, order in sort:
                reverse = order < 0
                filtered.sort(key=lambda x: x.get(field) or "", reverse=reverse)
        
        if limit:
            filtered = filtered[:limit]
            
        return filtered

    def find_one(self, query=None):
        docs = self._read()
        for d in docs:
            if self._match(d, query):
                return d
        return None

    def insert_one(self, document):
        docs = self._read()
        doc = dict(document)
        if "_id" not in doc:
            doc["_id"] = str(uuid.uuid4())
        if "id" not in doc:
            doc["id"] = doc["_id"]
        
        docs.append(doc)
        self._write(docs)
        
        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertResult(doc["_id"])

    def insert_many(self, documents):
        docs = self._read()
        inserted_ids = []
        for d in documents:
            doc = dict(d)
            if "_id" not in doc:
                doc["_id"] = str(uuid.uuid4())
            if "id" not in doc:
                doc["id"] = doc["_id"]
            docs.append(doc)
            inserted_ids.append(doc["_id"])
        self._write(docs)
        return inserted_ids

    def update_one(self, query, update, upsert=False):
        docs = self._read()
        match_idx = -1
        for i, d in enumerate(docs):
            if self._match(d, query):
                match_idx = i
                break
                
        now = datetime.utcnow().isoformat()
        
        # Extract operators
        set_data = update.get("$set", {})
        set_on_insert = update.get("$setOnInsert", {})
        push_data = update.get("$push", {})
        
        if match_idx >= 0:
            doc = docs[match_idx]
            for k, v in set_data.items():
                doc[k] = v
            for k, v in push_data.items():
                if k not in doc or not isinstance(doc[k], list):
                    doc[k] = []
                doc[k].append(v)
            doc["updatedAt"] = now
            docs[match_idx] = doc
            self._write(docs)
            return doc
        elif upsert:
            # Create new doc from query parameters + setOnInsert + set
            new_doc = {}
            # Base query values
            for k, v in query.items():
                if not k.startswith("$"):
                    new_doc[k] = v
            # Set values
            for k, v in set_data.items():
                new_doc[k] = v
            # Set on insert values
            for k, v in set_on_insert.items():
                new_doc[k] = v
            # Push values
            for k, v in push_data.items():
                new_doc[k] = [v]
                
            if "_id" not in new_doc:
                new_doc["_id"] = str(uuid.uuid4())
            if "id" not in new_doc:
                new_doc["id"] = new_doc["_id"]
            new_doc["createdAt"] = now
            new_doc["updatedAt"] = now
            
            docs.append(new_doc)
            self._write(docs)
            return new_doc
        return None

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        # Emulate find_one_and_update
        res = self.update_one(query, update, upsert=upsert)
        return res

    def delete_one(self, query):
        docs = self._read()
        match_idx = -1
        for i, d in enumerate(docs):
            if self._match(d, query):
                match_idx = i
                break
        if match_idx >= 0:
            docs.pop(match_idx)
            self._write(docs)
            return True
        return False

    def delete_many(self, query):
        docs = self._read()
        initial_count = len(docs)
        docs = [d for d in docs if not self._match(d, query)]
        self._write(docs)
        return initial_count - len(docs)

    def count_documents(self, query):
        docs = self._read()
        return len([d for d in docs if self._match(d, query)])


# Determine if we should use MongoDB or Fallback
use_mongo = False
db_client = None
mongo_db = None

try:
    print(f"Connecting to MongoDB URI: {MONGODB_URI[:30]}...")
    db_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=2000)
    # Ping
    db_client.admin.command('ping')
    mongo_db = db_client[MONGODB_DB]
    use_mongo = True
    print("Database: Connected successfully to MongoDB Atlas.")
except Exception as e:
    print(f"Database warning: Connection to MongoDB Atlas failed ({e}). Falling back to local JSON files.")
    use_mongo = False


def get_collection(name):
    if use_mongo and mongo_db is not None:
        return mongo_db[name]
    else:
        return JSONCollectionFallback(name)
