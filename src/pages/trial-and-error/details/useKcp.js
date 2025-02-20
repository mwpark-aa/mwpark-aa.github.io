import React from 'react';
import {Box, Container, Divider, List, ListItem, ListItemText, Typography} from "@mui/material";
import FloatingNavigation from "../../../components/FloatingNavigation";
import {BackgroundText} from "../../../constants/style";

const useKcp = () => {
    const navButtons = [
        {label: "자동결제 기획내용", target: "about-autobilling"},
        {label: "Spark 란?", target: "what-is-spark"},
        {label: "어려웠던 점", target: "challenges"},
    ];

    return (
        <Container maxWidth="md" sx={{py: 8}}>
            <FloatingNavigation buttons={navButtons}/>
            <Typography variant="h3" gutterBottom>
                자동결제 (PG사 연동)
            </Typography>

            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                기록일 : 2025년 2월 20일
            </Typography>

            <Divider sx={{my: 2}}/>

            <Typography variant="h5">
                자동결제 개발을 통해 트랜잭션 처리, 외부 API 연동, 배치 시스템 경험을 쌓은 내용을 간단하게 적는다
            </Typography>
            <br/>
            <Typography variant="h4" gutterBottom id="about-autobilling" pb={3} pt={10}>
                🚀 자동결제를 기획 내용
            </Typography>
            <Typography variant="body1">
                간단한 흐름도는 아래와 같다
                <List>
                    <ListItem>1. 사용자가 카드를 등록</ListItem>
                    <ListItem>2. 3분 Batch 로 사용자의 잔여 금액을 체크</ListItem>
                    <ListItem>3. 잔여 금액이 기준 금액 이하일 경우 자동 충전</ListItem>
                    <ListItem>4. 사용자에게 결제완료 메일 발송</ListItem>
                </List>
                여기서 내가 작업한 내용은 2, 3, 4번 항목이다. 초창기 개발 당시에는 Java 를 이용하여 개발하였고 SCDF 에서 배치를 돌렸으나. 후에
                관리포인트를 줄인다는 이유로 Python 과 Airflow 를 사용하도록 변경하였다.

                알림 메일 발송의 경우에는 기존 알림을 보내는 Batch 가 있었는데 여기서 다루는 데이터에 맞게 결제 정보를 저장하도록 포맷을 맞춰
                알림을 보내도록 하였다. 이 알림 메일 또한 후에 Java SCDF 에서 Python Airflow 로 이관하는 작업을 했다.
            </Typography>
            <Typography variant="h4" gutterBottom id="what-is-spark" pb={3} pt={10}>
                🤷 핵심 포인트
            </Typography>
            <Typography variant="body1">
                <List>
                    <ListItem>✅ 결제 실패시 Transaction 처리</ListItem>
                    <ListItem>✅ PG사 와의 커뮤니케이션</ListItem>
                </List>
            </Typography>

            <Typography variant="h6" pb={1} pt={1}>
                Transaction 처리
            </Typography>

            <Typography variant="body1">
                사실 이 작업을 초기에는 할 당시에는 Transaction 에 대해 정확히 모르는 상태였다. 지금 Transaction 에 대해서 내가 이해한대로마
                정말 간단하게 말하자면 <strong> 한 작업단위 </strong> 라고 이해했다.

                만약 결제 배치가 실행되는 도중 어떤 오류가 난다면 (DB 업데이트 오류, Timeout 오류 등등 경우는 엄청 많다)
                이 배치 안에서 일어난 모든 일들을 롤백해야 한다.

                실제 돈과 관련된 배치이기때문에 최대한 모든 오류의 가능성을 없애는데 집중하여 개발을 했다.

                배치의 내부에서의 해피케이스는
                사용자 잔여 예산, 충전할 금액 조회 (READ) -> PG 사 결제요청 -> 응답 -> DB 에 예산 추가 로 매우 간단하다.
                하지만 여기서
                1. PG 사 결제 요청 실패시
                2. PG 사 결제 실패 응답이 올 경우
                3. DB 예산 업데이트 실패시
                로 여러 오류 케이스가 생긴다.

                1. PG 사 결제 요청 실패시 :
                1. 내가 요청 데이터 잘못 보냈거나 (이 경우에는 코드 로직상의 에러이므로 생각하지 않는다)
                2. PG 사의 어떠한 이유로 요청을 보낼수 없는 상황 (대부분 Timeout 이 나오는 경우가 많다.)
                이럴 경우에는 단순히 다음 배치에서 재시도 하였을때 성공하기 때문에 단순히 배치를 거기서 종료하는것으로 끝냈다.

                2. 응답에서 결제 실패가 왔을 경우 :
                나는 이 경우에 응답을 3 가지 경우로 나눴다.
                1. 사용자의 카드나 계좌에 문제가 있는 경우 (사용자가 액션을 취해야 하는 경우)
                2. 단순히 재시도시 처리가 가능해지는 이유 (PG 사의 점검)
                3. 내부의 개발자가 처리를 해야 하는 이유 (Else 그 외의 에러로 잡긴 했지만 인증서 만료같은게 있을수 있을것 같음)

                때문에 1번의 경우에는 사용자에게 메일 알림, 2번의 경우에는 PASS, 3번의 경우에는 내부 슬랙으로 알림을 보냈다

                3. PG 사 결제는 성공했지만 DB 예산 업데이트에 실패했을 경우
                이 경우가 가장 중요한데 이때는 환불을 요청을 해야 정상적인 롤백이라고 볼 수 있다.
                여기서 혹시나 하는 경우를 위해 환불을 실패했을때는 내부 Slack 으로 알림이 오게 코드를 구성했다.
            </Typography>

            <Typography variant="h6" pb={1} pt={1}>
                PG 사와의 커뮤니케이션
            </Typography>

            <Typography variant="body1">
                당시 KCP 와의 연동을 작업중이었는데, 회사의 Key 를 받기위해 PG 사와 직접 메일로 소통을했다.
            </Typography>


            <Typography variant="h4" gutterBottom pb={3} pt={10} id={'challenges'}>
                😨 어려웠던 점
            </Typography>

            <List>
                <ListItem>
                    <ListItemText primary="✅ 실제 결제라는 사실에 대한 부담감이 컸다" sx={{fontWeight: "bold"}}/>
                </ListItem>
                <BackgroundText variant="body2">
                    <Box>
                        인턴 첫 과제로 회사의 매출에 영향을 줄 수 있는 작업을 준다는 사실이 너무 부담스러웠다.
                    </Box>
                    <Box mt={1}>
                        생각보다 처리해야하는 예외 작업이 너무 많았고, 기능을 테스트하기가 어려웠다.
                    </Box>
                </BackgroundText>
            </List>

            <ListItem>
                <ListItemText primary="✅ 단순 이관작업이 아닌 구조 변경과 성능 개선이 목적인 작업이었다" sx={{fontWeight: "bold"}}/>
            </ListItem>
            <List sx={{pl: {lg: 4}}}>
                <ListItemText primary="📌 분산 환경에서는 정렬이 불가능하다" sx={{py: 1}}/>
                <BackgroundText variant="body2">
                    <Box>
                        배치 실행 시간이 1~2시간 걸리다 보니, 진행도를 확인하기 위해
                        인덱스를 추가하려 했지만 예상치 못한 문제가 발생했다.
                    </Box>
                    <Box mt={1}>
                        데이터를 Partitioning 하면 순서가 보장되지 않는다. 정렬은 분산 처리 후 집계된 후에 가능하다.
                        연산 전에 정렬할 수도 있지만, 이 경우 분산 처리가 불가능해진다.
                    </Box>
                    <Box mt={1}>
                        해결책으로 2000만 라인 단위로 나누어 청크별 진행도를 확인하는 방식으로 변경했다.
                    </Box>
                </BackgroundText>
                <ListItemText primary="📌 파일의 우선순위" sx={{py: 1}}/>
                <BackgroundText variant="body2">
                    <Box>
                        기존 방식에서는 파일의 `LastModified` 를 확인해 변경되면 재작업을 수행했다.
                        하지만 이 방식으로 인해 새로 등록된 파일들이 변경된 기존 파일 때문에 무기한 대기 상태가 되었다.
                    </Box>
                    <Box mt={1}>
                        이로 인해 <strong> 등록한 파일 언제 처리되나요? </strong> 라는 문의가 많아졌고,
                        해결책으로 기존 파일과 신규 파일의 배치를 분리하여 처리하도록 변경했다.
                    </Box>
                </BackgroundText>
            </List>
        </Container>
    )
}
export default useKcp