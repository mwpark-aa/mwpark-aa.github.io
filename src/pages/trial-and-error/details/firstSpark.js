import React from "react";
import {Container, Typography, List, ListItem, Divider, Zoom, Fab, Box, Button} from "@mui/material";
import {CodeBlockBox} from "../../../constants/style";
import NavigationIcon from '@mui/icons-material/Navigation';

const FirstSpark = () => {
    const scrollTo = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({behavior: 'smooth'});
        }
    };

    return (
        <Container maxWidth="md" sx={{py: 8}}>
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 16,
                    right: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                }}
            >
                <Button variant="contained" onClick={() => scrollTo('what-is-spark')}>Spark란?</Button>
                <Button variant="contained" onClick={() => scrollTo('first-impressions')}>느낀점</Button>
                <Button variant="contained" onClick={() => scrollTo('challenges')}>어려웠던점</Button>
            </Box>
            <Typography variant="h3" gutterBottom>
                Spark 첫 사용기
            </Typography>

            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                202x년 x월 xx일
            </Typography>

            <Divider sx={{my: 2}}/>

            <Typography variant="body1" paragraph>
                최근 Apache Spark를 처음 사용해보면서, 분산 데이터 처리의 강력함을 직접 경험했다.
                이번 글에서는 Spark의 기본 개념과 첫 사용 후기를 공유하고자 한다.
            </Typography>

            <Typography variant="h5" gutterBottom>
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

        </Container>
    );
};

export default FirstSpark;
