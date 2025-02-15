export const RDD_CREATION_CODE = `data = [1, 2, 3]
rdd = spark.sparkContext.parallelize(data)
print(rdd.collect())
# 출력: [1, 2, 3, 4, 5]
`

export const RDD_SIMPLE_OPERATION_CODE = `# map
mapped_rdd = rdd.map(lambda x: x * 2)
print(mapped_rdd.collect())
# 출력: [2, 4, 6, 8, 10]

# filter
filtered_rdd = rdd.filter(lambda x: x % 2 == 0)
print(filtered_rdd.collect())
# 출력: [2, 4]

# reduce
sum_result = rdd.reduce(lambda x, y: x + y)
print(sum_result)
# 출력: 15

# count
count_result = rdd.count()
print(count_result)
# 출력: 5`

export const DATAFRAME_CREATION_CODE = `#리스트로부터 데이터 만들기
data = [("박민일", 10), ("박민이", 20), ("박민삼", 30), ("박민사", 40)]
columns = ["name", "age"]
df = spark.createDataFrame(data, schema=columns)
df.show()

# RDD로부터 DataFrame 만들기
df = rdd.toDF(columns)
df.show()

# *스키마를 사용하여 DataFrame 생성*
schema = StructType([
    StructField("name", StringType(), True),
    StructField("age", IntegerType(), True)
])

df = spark.createDataFrame(data, schema=schema)
df.show()

# +-------+-------+
# |   name|    age|
# +-------+-------+
# |  박민일|     10|
# |  박민이|     20|
# |  박민삼|     30|
# |  박민사|     40|
# +-------+-------+`;

export const DATAFRAME_SIMPLE_OPERATIONS_CODE = `# 컬럼 선택
df.select("name").show()

# +-------+
# |   name|
# +-------+
# |  박민일|
# |  박민이|
# |  박민삼|
# |  박민사|
# +-------+

# 필터링
df.filter(df.age > 20).show()
# +-------+-------+
# |   name|    age|
# +-------+-------+
# |  박민삼|     30|
# |  박민사|     40|
# +-------+-------+

# 정렬
df.sort("age", ascending=False).show()
# +-------+-------+
# |   name|    age|
# +-------+-------+
# |  박민사|     40|
# |  박민삼|     30|
# |  박민이|     20|
# |  박민일|     10|
# +-------+-------+`;

export const DATAFRAME_GROUPING_AGGREGATION_CODE = `# 평균나이, 개수
df.groupBy("name")
    .agg(avg("age").alias("age"), count("*").alias("count"))
    .show()`;

export const DATAFRAME_SQL_USAGE_CODE = `# 임시 뷰 생성
df.createOrReplaceTempView("family")

# SQL 쿼리 실행
result = spark.sql("SELECT * FROM family WHERE age > 20")
result.show()
# +-------+-------+
# |   name|    age|
# +-------+-------+
# |  박민삼|     30|
# |  박민사|     40|
# +-------+-------+`;

export const SPARK_SESSION_CREATION_CODE = `val spark = SparkSession.builder()
  .appName("First Spark App")
  .getOrCreate()`