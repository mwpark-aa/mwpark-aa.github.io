import React from "react";
import {Container, Typography, List, ListItem, Divider} from "@mui/material";
import {CodeBlockBox} from "../../../constants/style";
import FloatingNavigation from "../../../components/FloatingNavigation";

const FirstSpark = () => {
    const navButtons = [
        {label: "Spark란?", target: "what-is-spark"},
        {label: "느낀점", target: "first-impressions"},
        {label: "어려웠던점", target: "challenges"},
    ];
  return (
    <Container maxWidth="md" sx={{py: 8}}>
      <FloatingNavigation buttons={navButtons}/>
      <Typography variant="h3" gutterBottom>
        Spark 첫 사용기
      </Typography>

      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        202x년 x월 xx일
      </Typography>

      <Divider sx={{my: 2}}/>

      <Typography variant="h5" paragraph>
        Apache Spark를 처음 사용해보면서, 분산 데이터 처리의 강력함을 직접 경험했다.
        <br/>
        때문에 Spark를 사용하면서 공부한 기본 개념과 첫 사용 후기를 기록하려고 한다.
      </Typography>
      <Typography variant="body1">
        기존 20대의 서버에서 나눠서 8시간 정도 걸리던 작업을, 클러스터 환경에서 Spark 를 이용하니 30분만에 작업이 끝났다. 물론 다른 추가적인 수정내용도 있긴 하지만
        드라마틱한 성능 향상이었다.
      </Typography>
      <br/>
      <Typography variant="h5" gutterBottom id="what-is-spark">
        🚀 Spark란?
      </Typography>
      <Typography variant="body1" paragraph>
        Apache Spark는 대규모 데이터를 빠르게 처리할 수 있는 오픈소스 분산 데이터 처리 프레임워크이다.
        기존 Hadoop보다 빠르고, 메모리 기반 연산이 가능하다는 점에서 장점이 있다.
      </Typography>

      {/* 주요 개념 목록 */}
      <Typography variant="h6">🔑 주요 개념</Typography>
      <List>
        <ListItem>RDD(Resilient Distributed Dataset)</ListItem>
        <ListItem>DataFrame 및 Dataset</ListItem>
        <ListItem>Spark SQL</ListItem>
        <ListItem>Spark Streaming</ListItem>
      </List>

      {/* 코드 블록 스타일 */}
      <CodeBlockBox component="pre">
        {`val spark = SparkSession.builder()
  .appName("First Spark App")
  .getOrCreate()`}
      </CodeBlockBox>

      {/* 사용 후기 */}
      <Typography variant="h5" gutterBottom sx={{mt: 4}}>
        ✨ 첫 사용 후기
      </Typography>
      <Typography variant="body1" paragraph>
        첫 번째 Spark 애플리케이션을 실행하면서, 분산 환경에서의 데이터 처리가 얼마나 강력한지 깨달았다.
        하지만 설정이 까다로워 처음에는 시행착오가 있었다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>

      <Typography variant="body1" paragraph>
        앞으로 더 다양한 데이터 처리 작업을 Spark를 활용해 수행해볼 계획이다.
      </Typography>


    </Container>
  );
};

export default FirstSpark;
