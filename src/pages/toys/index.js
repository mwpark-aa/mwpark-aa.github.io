import React from 'react';
import {Box, Button, CardContent, Container, Grid, Typography} from "@mui/material";
import {BASIC_DOMAIN, toys} from "../../constants";
import {StyledCard} from "../../constants/style";
import {Link} from "react-router-dom";

const Toys = () => {

    return (
        <Container maxWidth="lg" sx={{py: 8}}>
            <Grid container spacing={8}>
                {toys.map((exp, index) => (
                    <Grid item key={index} xs={12} sm={6} md={4} lg={4} py={4}>
                        <StyledCard>
                            <Box sx={{height: '10px', p: 2}}/>
                            <CardContent sx={{pt: 2}}>
                                <Typography
                                    variant="h6"
                                    color="primary.main"
                                    fontWeight="bold"
                                    textAlign="center"
                                    gutterBottom
                                >
                                    {exp.title}
                                </Typography>
                            </CardContent>
                            <Button
                                variant="contained"
                                color="primary"
                                size="large"
                                onClick={() => window.open(BASIC_DOMAIN + exp.url, '_blank', 'noopener,noreferrer')}
                                sx={{m: 2, borderRadius: 20, boxShadow: 3, ':hover': {boxShadow: 6}}}
                            >
                                자세히 보기
                            </Button>

                        </StyledCard>
                    </Grid>
                ))}
            </Grid>
        </Container>
    )
}
export default Toys