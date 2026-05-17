from gremlin_python.driver import client, serializer
import os
from dotenv import load_dotenv

load_dotenv()

# Connection details
endpoint = os.getenv("COSMOS_ENDPOINT")
key = os.getenv("COSMOS_KEY")
database = os.getenv("COSMOS_DATABASE")
graph = os.getenv("COSMOS_GRAPH")

# Create Gremlin client
gremlin_client = client.Client(
    url=endpoint,
    traversal_source="g",
    username=f"/dbs/{database}/colls/{graph}",
    password=key,
    message_serializer=serializer.GraphSONSerializersV2d0()
)

# Test: create a vertex and query it back
result = gremlin_client.submit(
    "g.addV('test').property('user_id', 'test_user').property('name', 'hello')"
)

print("Created:", result.all().result())

result = gremlin_client.submit("g.V().hasLabel('test').values('name')")
print("Queried:", result.all().result())

gremlin_client.close()
