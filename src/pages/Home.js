import React from "react";
import {Avatar, Box, Container, Divider, IconButton, Link, Paper, Tooltip, Typography} from "@mui/material";
import {styled} from "@mui/material/styles";
import EmailIcon from "@mui/icons-material/Email";
import GitHubIcon from "@mui/icons-material/GitHub";
import CallIcon from '@mui/icons-material/Call';
import {ContactLink, StyledAvatar, StyledPaper, XBox} from "../constants/style";

const Home = () => {
    return (
        <Container maxWidth="sm">
            <Box sx={{mt: 8, textAlign: "center"}}>
                <StyledPaper elevation={3}>
                    <StyledAvatar src="/alcong.jpg"/>
                    <Typography variant="h5" sx={{color: "text.secondary"}}>
                        박민우
                    </Typography>
                    <Box sx={{display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center"}}>
                        <Tooltip title="연락처 (미제공)">
                            <IconButton color="disabled" sx={{mr: 1, position: "relative"}}>
                                <CallIcon/>
                                <XBox>
                                    ⨉
                                </XBox>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Email">
                            <ContactLink
                                href="https://mail.google.com/mail/u/0/?view=cm&fs=1&to=parkmin614@gmail.com&su=&body="
                                target="_blank">
                                <IconButton color="primary" sx={{mr: 1}}>
                                    <EmailIcon/>
                                </IconButton>
                            </ContactLink>
                        </Tooltip>
                        <Tooltip title="GitHub (미제공)">
                            <IconButton color="disabled" sx={{mr: 1, position: "relative"}}>
                                <GitHubIcon/>
                                <XBox>
                                    ⨉
                                </XBox>
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Divider sx={{my: 4}}/>
                    <Typography
                        variant="h5"
                        gutterBottom
                        sx={{fontWeight: "medium", textAlign: "left"}}>
                        📌 관심 분야
                    </Typography>
                    <Box sx={{display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left"}}>
                        <Typography sx={{my: 1, color: "text.secondary"}}>✔ 배치 시스템 개발</Typography>
                        <Typography sx={{my: 1, color: "text.secondary"}}>✔ 대규모 트래픽 처리 </Typography>
                    </Box>
                </StyledPaper>
            </Box>
        </Container>
    );
};

export default Home;
