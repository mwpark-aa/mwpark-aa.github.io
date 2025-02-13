import React from 'react';
import {CardContent, Typography, Button, Container, Grid, Box} from "@mui/material";
import {experiences} from "../../constants";
import {StyledCard, StyledMedia} from "../../constants/style";
import {Link} from "react-router-dom";

const TrialAndError = () => {
    return (
        <Container maxWidth="lg" sx={{py: 8}}>
            <Grid container spacing={8}>
                {experiences.map((exp, index) => (
                    <Grid item key={index} xs={12} sm={6} md={4} lg={4} py={4}>
                        <StyledCard>
                            <Box sx={{height: '10px', p: 2}}/>
                            <StyledMedia
                                image={exp.image}
                                title={exp.title}
                            />
                            <CardContent sx={{pt: 2}}>
                                <Typography
                                    variant="h6"
                                    color="primary.main"
                                    fontWeight="bold"
                                    textAlign="center"
                                    gutterBottom
                                >
                                    {exp.content}
                                </Typography>
                            </CardContent>
                            <Button
                                variant="contained"
                                color="primary"
                                size="large"
                                component={Link}
                                to={'/trial-and-error' + exp.url}
                                sx={{m: 2, borderRadius: 20, boxShadow: 3, ':hover': {boxShadow: 6}}}
                            >
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
