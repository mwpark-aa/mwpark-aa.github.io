import React from "react";
import { Container, Typography, Box } from "@mui/material";

const Home = () => {
    return (
        <Container>
            <Box sx={{ mt: 4, textAlign: "center" }}>
                <Typography variant="h3">안녕하세요! 👋</Typography>
                <Typography variant="h5" sx={{ mt: 2 }}>
                    저는 웹 개발자 [이름]입니다. 다양한 웹 애플리케이션을 만들고 있습니다.
                </Typography>
            </Box>
        </Container>
    );
};

export default Home;