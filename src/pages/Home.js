import React from "react";
import {Box, Container, Typography} from "@mui/material";

const Home = () => {
    return (
        <Container>
            <Box sx={{mt: 4, textAlign: "center"}}>
                <Typography variant="h3">안녕하세요! 👋</Typography>
                <Typography variant="h5" sx={{mt: 2}}>
                    HI.
                </Typography>
            </Box>
        </Container>
    );
};

export default Home;