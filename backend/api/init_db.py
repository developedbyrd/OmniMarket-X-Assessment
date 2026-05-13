import asyncio

import models
from database import engine


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)


if __name__ == "__main__":
    asyncio.run(init_db())
