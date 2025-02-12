import React from 'react';
import {CardContent, Typography, Button, Container, Grid, CardHeader} from "@mui/material";
import {experiences} from "../constants";
import {StyledCard, StyledMedia} from "../constants/style";

const TrialAndError = () => {
    return (
        <Container maxWidth="lg" sx={{py: 8}}>
            <Grid container spacing={8}>
                {experiences.map((exp, index) => (
                    <Grid item key={index} xs={12} sm={6} md={4} lg={4} py={4}>
                        <StyledCard>
                            <CardHeader
                                title={
                                    <Typography variant="h6" component="h2"
                                                sx={{fontWeight: 'bold', color: 'primary.main'}}>
                                        {exp.title}
                                    </Typography>
                                }
                                sx={{pb: 0}}
                            />
                            <StyledMedia
                                image={exp.image}
                                title={exp.title}
                            />
                            <CardContent sx={{pt: 2}}>
                                <Typography variant="body2" color="text.secondary">
                                    {exp.description}
                                </Typography>
                            </CardContent>
                            <Button variant="contained" color="primary" size="large"
                                    sx={{m: 2, borderRadius: 20, boxShadow: 3, ':hover': {boxShadow: 6}}}>
                                자세히 보기
                            </Button>
                        </StyledCard>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
}

export default TrialAndError;
