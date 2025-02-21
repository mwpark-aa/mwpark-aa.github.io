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
                    <ListItem>1️⃣ 사용자가 카드를 등록</ListItem>
                    <ListItem>2️⃣ 3분 Batch 로 사용자의 잔여 금액을 체크</ListItem>
                    <ListItem>3️⃣ 잔여 금액이 기준 금액 이하일 경우 자동 충전</ListItem>
                    <ListItem>4️⃣ 사용자에게 결제완료 메일 발송</ListItem>
                </List>
                <Typography variant="body1" mt={1}>
                    여기서 내가 작업한 내용은 2, 3, 4번 항목이다. 초창기 개발 당시에는 Java 를 이용하여 개발하였고 SCDF 에서 배치를 돌렸으나. 후에
                    관리포인트를 줄인다는 이유로 Python 과 Airflow 를 사용하도록 변경하였다.
                </Typography>
                <Typography variant="body1" mt={1}>
                    알림 메일 발송의 경우에는 기존 알림을 보내는 Batch 가 있었는데 여기서 다루는 데이터에 맞게 결제 정보를 저장하도록 포맷을 맞춰
                    알림을 보내도록 하였다. 이 알림 메일 또한 후에 Java SCDF 에서 Python Airflow 로 이관하는 작업을 했다.
                </Typography>
            </Typography>
            <Typography variant="h4" gutterBottom id="what-is-spark" pb={3} pt={10}>
                🤷 핵심 포인트
            </Typography>
            <Box sx={{pl: {lg: 2}}}>
                <Typography variant="h5" pb={1} pt={1}>
                    🔑 Transaction 처리
                </Typography>

                <Typography variant="body1" mt={1}>
                    사실 이 작업을 초기에는 할 당시에는 Transaction 에 대해 정확히 모르는 상태였다. 지금 Transaction 에 대해서 내가 이해한대로마
                    정말 간단하게 말하자면 <strong> 한 작업단위 </strong> 라고 이해했다.
                </Typography>
                <Typography variant="body1" mt={1}>
                    만약 결제 배치가 실행되는 도중 어떤 오류가 난다면 (DB 업데이트 오류, Timeout 오류 등등 경우는 엄청 많다)
                    이 배치 안에서 일어난 모든 일들을 롤백해야 한다.
                </Typography>
                <Typography variant="body1" my={1}>
                    실제 돈과 관련된 배치이기때문에 최대한 모든 오류의 가능성을 없애는데 집중하여 개발을 했다.
                </Typography>

                <List>
                    <ListItem>
                        <ListItemText primary="1️⃣ PG 사 결제 요청 실패시"/>
                    </ListItem>
                    <List sx={{pl: {lg: 4}}}>
                        <ListItem>
                            <ListItemText primary="📌 PG 사의 어떠한 이유로 요청을 보낼수 없는 상황"/>
                        </ListItem>
                    </List>
                    <Typography variant="body1" mt={1}>
                        이럴 경우에는 단순히 다음 배치에서 재시도 하였을때 성공하기 때문에 단순히 배치를 거기서 종료하는것으로 끝냈다.
                    </Typography>
                    <ListItem sx={{mt: 3}}>
                        <ListItemText primary="2️⃣ 응답에서 결제 실패가 왔을 경우"/>
                    </ListItem>
                    <List sx={{pl: {lg: 4}}}>
                        <ListItem>
                            <ListItemText primary="📌 사용자의 카드나 계좌에 문제가 있는 경우"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="📌 단순히 재시도시 처리가 가능해지는 이유 (PG 사의 점검)"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="📌 내부 개발자가 처리를 해야 하는 이유"/>
                        </ListItem>
                    </List>
                    <Typography variant="body1" mt={1}>
                        때문에 1번의 경우에는 사용자에게 메일 알림, 2번의 경우에는 PASS, 3번의 경우에는 내부 슬랙으로 알림을 보냈다

                    </Typography>
                    <ListItem sx={{mt: 3}}>
                        <ListItemText primary="3️⃣ PG 사 결제는 성공했지만 DB 예산 업데이트에 실패했을 경우"/>
                    </ListItem>
                    <Typography variant="body1" mt={1}>
                        이 경우가 가장 중요한데 이때는 환불을 요청을 해야 정상적인 롤백이라고 볼 수 있다.
                        여기서 혹시나 하는 경우를 위해 환불을 실패했을때는 내부 Slack 으로 알림이 오게 코드를 구성했다.
                    </Typography>
                </List>
            </Box>
            <Box>
                <Typography variant="h5" pb={1} pt={5}>
                    🫠 PG 사와의 커뮤니케이션
                </Typography>

                <Typography variant="body1">
                    당시 KCP 와의 연동을 작업중이었는데, 회사의 Key 를 받기위해 PG 사와 직접 메일로 소통을했다.
                </Typography>
            </Box>
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
        </Container>
    )
}
export default useKcp