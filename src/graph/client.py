from gremlin_python.driver import client, serializer

class GremlinClient:
    def __init__(self, endpoint: str, key: str, database: str, graph: str) -> None:
        self.gremlin_client = client.Client(
            url=endpoint,
            traversal_source="g",
            username=f"/dbs/{database}/colls/{graph}",
            password=key,
            message_serializer=serializer.GraphSONSerializersV2d0()
        )
        
    def execute(self, query: str) -> list:
        result = self.gremlin_client.submit(query)
        return result.all().result()
    
    def close(self) -> None:
        self.gremlin_client.close()