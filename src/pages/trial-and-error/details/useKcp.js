import React from 'react';
import {Container, Typography} from "@mui/material";

const useKcp = () => {
    console.log('test')
    console.log('hi')
    return (
        <Container maxWidth="md" sx={{py: 8}}>
            <Typography variant="h4" component="div">
                입사 후 인턴 과제
            </Typography>
        </Container>
    )
}
export default useKcp