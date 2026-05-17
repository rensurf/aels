import concurrent.futures
from gremlin_python.driver import client, serializer

class GremlinClient:
    def __init__(self, endpoint: str, key: str, database: str, graph: str) -> None:
        self._config = dict(
            url=endpoint,
            traversal_source="g",
            username=f"/dbs/{database}/colls/{graph}",
            password=key,
            message_serializer=serializer.GraphSONSerializersV2d0()
        )

    def execute(self, query: str) -> list:
        # Run in a thread to avoid event loop conflict when called from async context
        def _run():
            c = client.Client(**self._config)
            try:
                return c.submit(query).all().result()
            finally:
                c.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(_run).result()