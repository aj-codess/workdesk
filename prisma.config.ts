import "dotenv/config";
import {defineConfig,env} from  "prisma/config";

export default defineConfig({
    schema:"prisma/schema.prisma",
    dataSource:{
        url:env("DATABASE_URL"),
    },
});